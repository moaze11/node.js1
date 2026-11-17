import request from 'supertest';
import { prismaMock, resetPrismaMock } from './helpers/prismaMock';
import { generateAccessToken, generateRefreshToken, hashPassword, hashToken, verifyAccessToken } from '../src/utils';
import app from '../src/app';
import { resetAllRateLimits } from '../src/middlewares/rateLimit';

jest.mock('../src/services/session.service', () => jest.requireActual('./helpers/sessionMock'));
jest.mock('@prisma/client', () => {
  const { prismaMock } = jest.requireActual('./helpers/prismaMock');
  return { PrismaClient: jest.fn(() => prismaMock), Prisma: {} };
});
jest.mock('../src/services/email.service', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined)
}));

const tokenFor = (userId: number, role: string) =>
  `Bearer ${generateAccessToken({ userId, email: `${role.toLowerCase()}@test.com`, role, sid: 1 })}`;

const SUPER = tokenFor(1, 'SuperAdmin');
const ADMIN = tokenFor(2, 'Admin');
const AGENT = tokenFor(20, 'Agent');
const USER = tokenFor(10, 'User');

beforeEach(() => {
  resetPrismaMock();
  resetAllRateLimits();
});

jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Authentication', () => {
  const activeUser = async (overrides = {}) => ({
    id: 10,
    email: 'user@test.com',
    password: await hashPassword('Password123'),
    isActive: true,
    role: { id: 4, name: 'User' },
    ...overrides
  });

  it('logs in with valid credentials and returns access + refresh tokens', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await activeUser());
    prismaMock.refreshToken.create.mockResolvedValue({ id: 7 });

    const res = await request(app).post('/auth/login').send({ email: 'user@test.com', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toEqual({ id: 10, email: 'user@test.com', role: 'User' });
    expect(res.body.user.password).toBeUndefined();
    // VULN-004 : seule l'empreinte du refresh token est stockée
    expect(prismaMock.refreshToken.create.mock.calls[0][0].data.token).toBe(hashToken(res.body.refreshToken));
    // VULN-002 : l'access token est rattaché à la session créée
    expect(verifyAccessToken(res.body.accessToken)?.sid).toBe(7);
  });

  it('rejects a wrong password with 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await activeUser());
    const res = await request(app).post('/auth/login').send({ email: 'user@test.com', password: 'nope-nope' });
    expect(res.status).toBe(401);
  });

  it('rejects a disabled account with 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue(await activeUser({ isActive: false }));
    const res = await request(app).post('/auth/login').send({ email: 'user@test.com', password: 'Password123' });
    expect(res.status).toBe(401);
  });

  it('validates login input (400 with details)', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(res.body.details.map((d: any) => d.path)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rotates the refresh token: old one revoked, new one issued', async () => {
    const oldToken = generateRefreshToken(10);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 5, token: oldToken, userId: 10, revokedAt: null, expiresAt: new Date(Date.now() + 60_000)
    });
    prismaMock.user.findUnique.mockResolvedValue(await activeUser());
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 6 });

    const res = await request(app).post('/auth/refresh').send({ refreshToken: oldToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(oldToken);
    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({ where: { token: hashToken(oldToken) } });
    // VULN-003 : consommation atomique (seulement si encore actif)
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 5, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ token: hashToken(res.body.refreshToken), userId: 10 }) })
    );
  });

  it('VULN-003: reusing a revoked refresh token revokes every session of the user', async () => {
    const token = generateRefreshToken(10);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 5, token: hashToken(token), userId: 10, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000)
    });
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const res = await request(app).post('/auth/refresh').send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 10, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'REFRESH_TOKEN_REUSE' }) })
    );
  });

  it('VULN-003: a request that loses the race (token consumed meanwhile) gets no new session', async () => {
    const token = generateRefreshToken(10);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 5, token: hashToken(token), userId: 10, revokedAt: null, expiresAt: new Date(Date.now() + 60_000)
    });
    prismaMock.user.findUnique.mockResolvedValue(await activeUser());
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 }); // une autre requête l'a déjà consommé

    const res = await request(app).post('/auth/refresh').send({ refreshToken: token });

    expect(res.status).toBe(401);
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses an expired refresh token', async () => {
    const token = generateRefreshToken(10);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 5, token, userId: 10, revokedAt: null, expiresAt: new Date(Date.now() - 1000)
    });
    const res = await request(app).post('/auth/refresh').send({ refreshToken: token });
    expect(res.status).toBe(401);
  });

  it('logout revokes the session and logs it', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({ id: 7, userId: 10, revokedAt: null });
    prismaMock.refreshToken.update.mockResolvedValue({});

    const res = await request(app).post('/auth/logout').send({ refreshToken: 'some-token' });

    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({ where: { token: hashToken('some-token') } });
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USER_LOGOUT', actorId: 10 }) })
    );
  });

  it('logout with an unknown token answers the same and changes nothing', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/auth/logout').send({ refreshToken: 'unknown' });
    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
  });
});

describe('Permissions (RBAC)', () => {
  it.each([
    ['get', '/user/profile'],
    ['get', '/tickets'],
    ['get', '/admin/users'],
    ['post', '/auth/invite']
  ])('%s %s without token → 401', async (method, path) => {
    const res = await (request(app) as any)[method](path);
    expect(res.status).toBe(401);
  });

  it('rejects a forged token → 401', async () => {
    const res = await request(app).get('/tickets').set('Authorization', 'Bearer forged.token.value');
    expect(res.status).toBe(401);
  });

  it.each([
    ['User', USER, 'get', '/admin/users'],
    ['Agent', AGENT, 'get', '/admin/users'],
    ['User', USER, 'post', '/auth/invite'],
    ['Agent', AGENT, 'post', '/auth/invite'],
    ['Admin', ADMIN, 'patch', '/admin/users/3/role'],
    ['Admin', ADMIN, 'patch', '/admin/users/3/status'],
    ['Admin', ADMIN, 'get', '/admin/audit-logs'],
    ['User', USER, 'patch', '/tickets/1'],
    ['User', USER, 'get', '/agent/tickets']
  ])('%s cannot %s %s → 403', async (_role, token, method, path) => {
    const res = await (request(app) as any)[method](path).set('Authorization', token).send({});
    expect(res.status).toBe(403);
  });

  it('Admin can list users, without password hashes', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 1, email: 'a@test.com' }]);
    const res = await request(app).get('/admin/users').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    const select = prismaMock.user.findMany.mock.calls[0][0].select;
    expect(select.password).toBeUndefined();
    expect(select.email).toBe(true);
  });
});

describe('Tickets: listing with pagination, filtering, sorting', () => {
  beforeEach(() => {
    prismaMock.ticket.count.mockResolvedValue(45);
    prismaMock.ticket.findMany.mockResolvedValue([{ id: 1, title: 'Printer' }]);
  });

  it('returns data + pagination metadata', async () => {
    const res = await request(app).get('/tickets?page=2&limit=10').set('Authorization', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 45, totalPages: 5 });
    expect(prismaMock.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
  });

  it('applies filters and sort', async () => {
    await request(app)
      .get('/tickets?status=open&priority=high&sortBy=title&order=asc&search=printer')
      .set('Authorization', ADMIN);
    const args = prismaMock.ticket.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ title: 'asc' });
    expect(args.where.AND).toContainEqual({ status: 'open' });
    expect(args.where.AND).toContainEqual({ priority: 'high' });
  });

  it('a User only gets their own tickets (access rule in the query)', async () => {
    await request(app).get('/tickets').set('Authorization', USER);
    expect(prismaMock.ticket.findMany.mock.calls[0][0].where.AND[0]).toEqual({ ownerId: 10 });
  });

  it('an Agent only gets assigned or unassigned tickets', async () => {
    await request(app).get('/tickets').set('Authorization', AGENT);
    expect(prismaMock.ticket.findMany.mock.calls[0][0].where.AND[0]).toEqual({
      OR: [{ assigneeId: 20 }, { assigneeId: null }]
    });
  });

  it.each(['limit=1000', 'page=0', 'sortBy=password', "status=open'--", 'order=up'])(
    'rejects invalid query %s with 400',
    async (qs) => {
      const res = await request(app).get(`/tickets?${qs}`).set('Authorization', ADMIN);
      expect(res.status).toBe(400);
      expect(prismaMock.ticket.findMany).not.toHaveBeenCalled();
    }
  );

  it("a User cannot read someone else's ticket (404, existence not revealed)", async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 7, ownerId: 99, assigneeId: null });
    const res = await request(app).get('/tickets/7').set('Authorization', USER);
    expect(res.status).toBe(404);
  });

  it('a User can read their own ticket', async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 7, ownerId: 10, assigneeId: null });
    const res = await request(app).get('/tickets/7').set('Authorization', USER);
    expect(res.status).toBe(200);
  });

  it('creating a ticket sets the owner from the token, not from the body', async () => {
    prismaMock.ticket.create.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .post('/tickets')
      .set('Authorization', USER)
      .send({ title: 'Printer broken', ownerId: 1 });
    expect(res.status).toBe(201);
    expect(prismaMock.ticket.create.mock.calls[0][0].data.ownerId).toBe(10);
  });

  it('an Agent cannot assign a ticket to someone else', async () => {
    prismaMock.ticket.findUnique.mockResolvedValue({ id: 7, ownerId: 10, assigneeId: null });
    const res = await request(app).patch('/tickets/7').set('Authorization', AGENT).send({ assigneeId: 21 });
    expect(res.status).toBe(403);
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });
});

describe('Audit logs for sensitive actions', () => {
  it('logs a role change with old and new role', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 3, role: { name: 'User' } });
    prismaMock.role.findUnique.mockResolvedValue({ id: 3, name: 'Agent' });
    prismaMock.user.update.mockResolvedValue({ id: 3 });

    const res = await request(app).patch('/admin/users/3/role').set('Authorization', SUPER).send({ roleId: 3 });

    expect(res.status).toBe(200);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ROLE_ASSIGNED',
        actorId: 1,
        targetUserId: 3,
        changes: JSON.stringify({ from: 'User', to: 'Agent' })
      })
    });
  });

  it('logs a deactivation and revokes the user sessions', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 3 });
    prismaMock.user.update.mockResolvedValue({ id: 3, isActive: false });
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    const res = await request(app).patch('/admin/users/3/status').set('Authorization', SUPER).send({ isActive: false });

    expect(res.status).toBe(200);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 3, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_DEACTIVATED', actorId: 1, targetUserId: 3 })
    });
  });

  it('logs a reactivation', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 3 });
    prismaMock.user.update.mockResolvedValue({ id: 3, isActive: true });
    await request(app).patch('/admin/users/3/status').set('Authorization', SUPER).send({ isActive: true });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'USER_REACTIVATED' })
    });
  });

  it('rejects a non-numeric user id', async () => {
    const res = await request(app).patch('/admin/users/abc/role').set('Authorization', SUPER).send({ roleId: 2 });
    expect(res.status).toBe(400);
  });
});

describe('Brute-force protection', () => {
  it('blocks the 6th login attempt in the window with 429', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/auth/login').send({ email: 'x@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send({ email: 'x@test.com', password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('general traffic does not consume the login quota', async () => {
    for (let i = 0; i < 10; i++) await request(app).get('/health');
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/auth/login').send({ email: 'x@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
  });
});

describe('Consistent API responses & docs', () => {
  it('unknown route → JSON 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Not Found', statusCode: 404 });
  });

  it('unexpected error → 500 without leaking details', async () => {
    prismaMock.ticket.count.mockRejectedValue(new Error('db exploded: secret info'));
    prismaMock.ticket.findMany.mockResolvedValue([]);
    const res = await request(app).get('/tickets').set('Authorization', ADMIN);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret info');
  });

  it('serves the OpenAPI spec with the ticket routes', async () => {
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/auth/login', '/tickets', '/tickets/{id}', '/admin/users/{id}/role', '/admin/audit-logs'])
    );
  });
});
