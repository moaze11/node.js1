import request from 'supertest';
import { prismaMock, resetPrismaMock } from './helpers/prismaMock';
import { generateAccessToken, hashPassword } from '../src/utils';
import app from '../src/app';
import { generalRateLimit, loginRateLimit, sensitiveRateLimit } from '../src/middlewares/rateLimit';

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

const bearer = (userId: number, role: string) =>
  `Bearer ${generateAccessToken({ userId, email: 'x@test.com', role })}`;

beforeEach(() => {
  resetPrismaMock();
  generalRateLimit.reset();
  loginRateLimit.reset();
  sensitiveRateLimit.reset();
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
    const token = prismaMock.invitation.create.mock.calls[0][0].data.token;
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});

describe('SuperAdmin bootstrap', () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
    delete process.env.ALLOW_SUPERADMIN_BOOTSTRAP;
  });

  it('is closed in production unless explicitly allowed', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/auth/super-admin').send({ email: 'evil@test.com', password: 'Password123' });
    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('is refused once a SuperAdmin exists', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });
    const res = await request(app).post('/auth/super-admin').send({ email: 'evil@test.com', password: 'Password123' });
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
