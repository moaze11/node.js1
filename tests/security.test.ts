import request from 'supertest';
import { prismaMock, resetPrismaMock } from './helpers/prismaMock';
import { generateAccessToken, hashPassword } from '../src/utils';
import app from '../src/app';
import { resetAllRateLimits } from '../src/middlewares/rateLimit';
import { sendInvitationEmail } from '../src/services/email.service';

// Ici le middleware utilise le VRAI session.service (relecture en base), avec Prisma mocké
jest.mock('@prisma/client', () => {
  const { prismaMock } = jest.requireActual('./helpers/prismaMock');
  return { PrismaClient: jest.fn(() => prismaMock), Prisma: {} };
});
jest.mock('../src/services/email.service', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true)
}));

// Convention de test : la session d'un utilisateur porte son id (sid = userId)
const bearer = (userId: number, role: string) =>
  `Bearer ${generateAccessToken({ userId, email: 'x@test.com', role, sid: userId })}`;

// Session active par défaut : la ligne RefreshToken n°X appartient à l'utilisateur X
const activeSession = ({ where }: any) =>
  Promise.resolve(where.id ? { userId: where.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000) } : null);

beforeEach(() => {
  resetPrismaMock();
  resetAllRateLimits();
  prismaMock.refreshToken.findUnique.mockImplementation(activeSession);
});

jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Session revalidated on every request', () => {
  it('a disabled account is rejected immediately, even with a valid token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'u@test.com', isActive: false, role: { name: 'User' } });
    const res = await request(app).get('/user/profile').set('Authorization', bearer(10, 'User'));
    expect(res.status).toBe(401);
  });

  it('a deleted account is rejected', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/tickets').set('Authorization', bearer(10, 'User'));
    expect(res.status).toBe(401);
  });

  it('a demoted Admin loses admin access immediately (role read from DB, not from the token)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'a@test.com', isActive: true, role: { name: 'User' } });
    const res = await request(app).get('/admin/users').set('Authorization', bearer(2, 'Admin'));
    expect(res.status).toBe(403);
  });

  it('a token claiming SuperAdmin does not grant SuperAdmin if the DB says otherwise', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'u@test.com', isActive: true, role: { name: 'User' } });
    const res = await request(app)
      .patch('/admin/users/3/role')
      .set('Authorization', bearer(10, 'SuperAdmin'))
      .send({ roleId: 1 });
    expect(res.status).toBe(403);
  });

  it('a token signed with another secret is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ userId: 1, email: 'x', role: 'SuperAdmin' }, 'attacker-secret-attacker-secret-attacker');
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('an unsigned token (alg: none) is rejected', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ userId: 1, role: 'SuperAdmin' })).toString('base64url');
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  it('a refresh token cannot be used as an access token', async () => {
    const { generateRefreshToken } = require('../src/utils');
    const res = await request(app).get('/tickets').set('Authorization', `Bearer ${generateRefreshToken(1)}`);
    expect(res.status).toBe(401);
  });
});

describe('Login does not leak account information', () => {
  it('a disabled account with a WRONG password gets the generic error', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 10, email: 'u@test.com', isActive: false, password: await hashPassword('RealPassword1'), role: { name: 'User' }
    });
    const res = await request(app).post('/auth/login').send({ email: 'u@test.com', password: 'guess-guess' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('unknown email and wrong password give the same response', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app).post('/auth/login').send({ email: 'ghost@test.com', password: 'whatever1' });

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 10, email: 'u@test.com', isActive: true, password: await hashPassword('RealPassword1'), role: { name: 'User' }
    });
    const wrong = await request(app).post('/auth/login').send({ email: 'u@test.com', password: 'whatever1' });

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body).toEqual(wrong.body);
  });
});

describe('Invitations cannot be hijacked', () => {
  it('the invitation token is never returned in the API response', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: 'admin@test.com', isActive: true, role: { name: 'Admin' } }) // session
      .mockResolvedValueOnce(null); // email libre
    prismaMock.invitation.findUnique.mockResolvedValue(null);
    prismaMock.invitation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

    const res = await request(app).post('/auth/invite').set('Authorization', bearer(2, 'Admin')).send({ email: 'new@test.com' });

    expect(res.status).toBe(201);
    const emailedToken = (sendInvitationEmail as jest.Mock).mock.calls[0][1];
    expect(JSON.stringify(res.body)).not.toContain(emailedToken);
  });
});

// Retest VULN-002 (audit/VULN-002-token-valide-apres-logout.md)
describe('Access token tied to its session (VULN-002)', () => {
  const user = { email: 'u@test.com', isActive: true, role: { name: 'User' } };

  it('PoC replay: the access token is refused once its session is revoked (logout)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      userId: 10, revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000)
    });
    const res = await request(app).get('/user/profile').set('Authorization', bearer(10, 'User'));
    expect(res.status).toBe(401);
  });

  it('a session belonging to another user is refused', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      userId: 99, revokedAt: null, expiresAt: new Date(Date.now() + 60_000)
    });
    const res = await request(app).get('/user/profile').set('Authorization', bearer(10, 'User'));
    expect(res.status).toBe(401);
  });

  it('an access token without session id is refused', async () => {
    const legacy = require('jsonwebtoken').sign({ userId: 10, email: 'u@test.com', role: 'User' }, process.env.JWT_SECRET);
    prismaMock.user.findUnique.mockResolvedValue(user);
    const res = await request(app).get('/user/profile').set('Authorization', `Bearer ${legacy}`);
    expect(res.status).toBe(401);
  });

  it('an active session is accepted', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 10, ...user, emailVerified: true, createdAt: new Date() });
    const res = await request(app).get('/user/profile').set('Authorization', bearer(10, 'User'));
    expect(res.status).toBe(200);
  });
});

// Retest VULN-005 (audit/VULN-005-connexions-absentes-audit.md)
describe('Authentication events are audited (VULN-005)', () => {
  const auditActions = () => prismaMock.auditLog.create.mock.calls.map((c: any[]) => c[0].data.action);

  it('PoC replay: failed logins are logged with the targeted email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await request(app).post('/auth/login').send({ email: 'alice@test.com', password: 'guess-1' });
    expect(auditActions()).toEqual(['FAILED_LOGIN']);
    expect(prismaMock.auditLog.create.mock.calls[0][0].data.changes).toContain('alice@test.com');
  });

  it('successful logins are logged', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 10, email: 'u@test.com', isActive: true, password: await hashPassword('RealPassword1'), role: { name: 'User' }
    });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 3 });
    const res = await request(app).post('/auth/login').send({ email: 'u@test.com', password: 'RealPassword1' });
    expect(res.status).toBe(200);
    expect(auditActions()).toEqual(['USER_LOGIN']);
  });
});

// Retest VULN-006 (audit/VULN-006-enumeration-emails-timing.md)
describe('Forgot-password answers before any lookup (VULN-006)', () => {
  it('PoC replay: the response does not wait for the database or the email', async () => {
    // La base ne répond jamais : si la réponse attendait la recherche du compte, la requête bloquerait
    prismaMock.user.findUnique.mockReturnValue(new Promise(() => {}));
    const res = await request(app).post('/auth/forgot-password').send({ email: 'alice@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If this email exists, a password reset link has been sent');
  });
});

// Retest VULN-007 (audit/VULN-007-brute-force-multi-ip.md)
describe('Login attempts limited per account, whatever the IP (VULN-007)', () => {
  beforeAll(() => app.set('trust proxy', true)); // permet de simuler plusieurs IP via X-Forwarded-For
  afterAll(() => app.set('trust proxy', false));

  it('PoC replay: changing IP does not give more attempts on the same account', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const attempt = (ip: string) =>
      request(app).post('/auth/login').set('X-Forwarded-For', ip).send({ email: 'alice@test.com', password: 'wrong' });

    for (let i = 0; i < 5; i++) expect((await attempt('10.0.0.1')).status).toBe(401);
    expect((await attempt('10.0.0.2')).status).toBe(429);
    expect((await attempt('10.0.0.3')).status).toBe(429);
  });

  it('the account limit does not block other accounts', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/auth/login').set('X-Forwarded-For', `10.1.0.${i}`).send({ email: 'alice@test.com', password: 'x' });
    }
    const other = await request(app).post('/auth/login').set('X-Forwarded-For', '10.1.0.9').send({ email: 'bob@test.com', password: 'x' });
    expect(other.status).toBe(401);
  });
});

// Retest VULN-008 (audit/VULN-008-bombardement-emails-reset.md)
describe('Password reset requests limited per email (VULN-008)', () => {
  beforeAll(() => app.set('trust proxy', true));
  afterAll(() => app.set('trust proxy', false));

  it('PoC replay: at most 3 requests per hour for one email, whatever the IP', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const ask = (ip: string) =>
      request(app).post('/auth/forgot-password').set('X-Forwarded-For', ip).send({ email: 'alice@test.com' });

    for (const ip of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) expect((await ask(ip)).status).toBe(200);
    expect((await ask('10.0.0.4')).status).toBe(429);
  });
});

// Retest VULN-010 (audit/VULN-010-swagger-public-entetes.md)
describe('Production hardening (VULN-010)', () => {
  const loadAppWith = (env: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    let prodApp: any;
    jest.isolateModules(() => { prodApp = require('../src/app').default; });
    process.env = saved;
    return prodApp;
  };

  it('PoC replay: API docs are not served in production', async () => {
    const prodApp = loadAppWith({ NODE_ENV: 'production' });
    expect((await request(prodApp).get('/api-docs.json')).status).toBe(404);
    expect((await request(prodApp).get('/api-docs')).status).toBe(404);
  });

  it('API docs can be opened explicitly in production', async () => {
    const prodApp = loadAppWith({ NODE_ENV: 'production', ENABLE_API_DOCS: 'true' });
    expect((await request(prodApp).get('/api-docs.json')).status).toBe(200);
  });

  it('HSTS and CSP headers are sent', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});

// Retest VULN-001 (audit/VULN-001-bootstrap-superadmin.md)
describe('SuperAdmin bootstrap (VULN-001)', () => {
  const BOOTSTRAP_TOKEN = 'test-bootstrap-token-0123456789abcdef0123';
  const body = { email: 'evil@test.com', password: 'Password123' };
  const bootstrap = (token?: string) => {
    const req = request(app).post('/auth/super-admin');
    if (token !== undefined) req.set('X-Bootstrap-Token', token);
    return req.send(body);
  };

  // Base vide : aucun SuperAdmin, rôle présent, création possible
  function emptyDatabase() {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.role.findUnique.mockResolvedValue({ id: 1, name: 'SuperAdmin' });
    prismaMock.user.create.mockResolvedValue({ id: 1, email: body.email, role: { name: 'SuperAdmin' } });
    prismaMock.refreshToken.create.mockResolvedValue({});
  }

  afterEach(() => {
    delete process.env.SUPERADMIN_BOOTSTRAP_TOKEN;
  });

  it('is closed when no bootstrap token is configured, even outside production', async () => {
    emptyDatabase();
    const res = await bootstrap();
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('PoC replay: two simultaneous anonymous requests on an empty database are both refused', async () => {
    emptyDatabase();
    const [a, b] = await Promise.all([bootstrap(), bootstrap()]);
    expect([a.status, b.status]).toEqual([403, 403]);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('is refused with a wrong token', async () => {
    process.env.SUPERADMIN_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
    emptyDatabase();
    const res = await bootstrap('wrong-token');
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('stays closed when the configured token is too short', async () => {
    process.env.SUPERADMIN_BOOTSTRAP_TOKEN = 'short';
    emptyDatabase();
    const res = await bootstrap('short');
    expect(res.status).toBe(403);
  });

  it('creates the SuperAdmin with the right token on an empty database', async () => {
    process.env.SUPERADMIN_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
    emptyDatabase();
    const res = await bootstrap(BOOTSTRAP_TOKEN);
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
  });

  it('creates only one SuperAdmin when the right token is sent twice at once', async () => {
    process.env.SUPERADMIN_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
    emptyDatabase();
    const statuses = (await Promise.all([bootstrap(BOOTSTRAP_TOKEN), bootstrap(BOOTSTRAP_TOKEN)])).map((r) => r.status);
    expect(statuses.sort()).toEqual([201, 409]);
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
  });

  it('is refused once a SuperAdmin exists, even with the right token', async () => {
    process.env.SUPERADMIN_BOOTSTRAP_TOKEN = BOOTSTRAP_TOKEN;
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });
    const res = await bootstrap(BOOTSTRAP_TOKEN);
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe('Hardening', () => {
  it('does not advertise Express and sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('malformed JSON → 400 (not 500)', async () => {
    const res = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('oversized body → 413', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'a@test.com', password: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it('unknown fields cannot escalate privileges when creating a ticket', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: 'u@test.com', isActive: true, role: { name: 'User' } });
    prismaMock.ticket.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

    await request(app)
      .post('/tickets')
      .set('Authorization', bearer(10, 'User'))
      .send({ title: 'Bug login', ownerId: 1, assigneeId: 20, status: 'closed', category: 'off_topic' });

    const data = prismaMock.ticket.create.mock.calls[0][0].data;
    expect(data.ownerId).toBe(10);
    expect(data.assigneeId).toBeUndefined();
    expect(data.status).toBeUndefined();
    expect(data.category).toBeUndefined();
  });
});
