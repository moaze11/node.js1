import request from 'supertest';
import { prismaMock, resetPrismaMock } from './helpers/prismaMock';
import { generateAccessToken, comparePassword } from '../src/utils';
import app from '../src/app';
import { loginRateLimit, sensitiveRateLimit, generalRateLimit } from '../src/middlewares/rateLimit';
import { sendInvitationEmail, sendPasswordResetEmail } from '../src/services/email.service';

jest.mock('../src/services/session.service', () => jest.requireActual('./helpers/sessionMock'));
jest.mock('@prisma/client', () => {
  const { prismaMock } = jest.requireActual('./helpers/prismaMock');
  return { PrismaClient: jest.fn(() => prismaMock), Prisma: {} };
});
jest.mock('../src/services/email.service', () => ({
  sendInvitationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true)
}));

const ADMIN = `Bearer ${generateAccessToken({ userId: 2, email: 'admin@test.com', role: 'Admin' })}`;
const inFuture = () => new Date(Date.now() + 60 * 60 * 1000);
const inPast = () => new Date(Date.now() - 1000);

beforeEach(() => {
  resetPrismaMock();
  (sendInvitationEmail as jest.Mock).mockClear();
  (sendPasswordResetEmail as jest.Mock).mockClear();
  loginRateLimit.reset();
  sensitiveRateLimit.reset();
  generalRateLimit.reset();
});

describe('Invitations', () => {
  it('an Admin invites a new user: invitation stored and email sent', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.invitation.findUnique.mockResolvedValue(null);
    prismaMock.invitation.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 1, ...data }));

    const res = await request(app).post('/auth/invite').set('Authorization', ADMIN).send({ email: 'new@test.com' });

    expect(res.status).toBe(201);
    const stored = prismaMock.invitation.create.mock.calls[0][0].data;
    expect(stored.email).toBe('new@test.com');
    expect(stored.token).toEqual(expect.any(String));
    expect(stored.token.length).toBeGreaterThanOrEqual(32);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sendInvitationEmail).toHaveBeenCalledWith('new@test.com', stored.token);
  });

  it('cannot invite an email that already has an account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 5 });
    const res = await request(app).post('/auth/invite').set('Authorization', ADMIN).send({ email: 'taken@test.com' });
    expect(res.status).toBe(400);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/auth/invite').set('Authorization', ADMIN).send({ email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('accepting an invitation creates the user with a hashed password and the User role', async () => {
    prismaMock.invitation.findUnique.mockResolvedValue({
      id: 1, email: 'new@test.com', token: 'tok', expiresAt: inFuture(), acceptedAt: null
    });
    prismaMock.role.findUnique.mockResolvedValue({ id: 4, name: 'User' });
    prismaMock.user.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 30, email: data.email, role: { name: 'User' } })
    );
    prismaMock.invitation.update.mockResolvedValue({});

    const res = await request(app).post('/auth/accept-invitation').send({ token: 'tok', password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 30, email: 'new@test.com', role: 'User' });
    const created = prismaMock.user.create.mock.calls[0][0].data;
    expect(created.roleId).toBe(4);
    expect(created.password).not.toBe('Password123');
    expect(await comparePassword('Password123', created.password)).toBe(true);
    expect(prismaMock.invitation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { acceptedAt: expect.any(Date), userId: 30 }
    });
  });

  it.each([
    ['unknown token', null],
    ['expired invitation', { id: 1, email: 'a@test.com', expiresAt: inPast(), acceptedAt: null }],
    ['already accepted', { id: 1, email: 'a@test.com', expiresAt: inFuture(), acceptedAt: new Date() }]
  ])('refuses %s', async (_label, invitation) => {
    prismaMock.invitation.findUnique.mockResolvedValue(invitation);
    const res = await request(app).post('/auth/accept-invitation').send({ token: 'tok', password: 'Password123' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('refuses a weak password', async () => {
    const res = await request(app).post('/auth/accept-invitation').send({ token: 'tok', password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('Password reset', () => {
  it('requesting a reset stores a token and sends the email', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 10, email: 'user@test.com', isActive: true });
    prismaMock.passwordReset.create.mockResolvedValue({});

    const res = await request(app).post('/auth/forgot-password').send({ email: 'user@test.com' });

    expect(res.status).toBe(200);
    const stored = prismaMock.passwordReset.create.mock.calls[0][0].data;
    expect(stored.userId).toBe(10);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sendPasswordResetEmail).toHaveBeenCalledWith('user@test.com', stored.token);
  });

  it('does not reveal whether an email exists (same response)', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'user@test.com', isActive: true });
    prismaMock.passwordReset.create.mockResolvedValue({});
    const known = await request(app).post('/auth/forgot-password').send({ email: 'user@test.com' });

    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app).post('/auth/forgot-password').send({ email: 'ghost@test.com' });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('resets the password with a valid token, consumes it and revokes sessions', async () => {
    prismaMock.passwordReset.findUnique.mockResolvedValue({
      id: 3, token: 'tok', userId: 10, expiresAt: inFuture(), usedAt: null
    });
    prismaMock.passwordReset.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app).post('/auth/reset-password').send({ token: 'tok', password: 'NewPassword123' });

    expect(res.status).toBe(200);
    expect(prismaMock.passwordReset.updateMany).toHaveBeenCalledWith({
      where: { id: 3, usedAt: null },
      data: { usedAt: expect.any(Date) }
    });
    const newHash = prismaMock.user.update.mock.calls[0][0].data.password;
    expect(await comparePassword('NewPassword123', newHash)).toBe(true);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 10, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it.each([
    ['unknown token', null],
    ['expired token', { id: 3, userId: 10, expiresAt: inPast(), usedAt: null }],
    ['already used token', { id: 3, userId: 10, expiresAt: inFuture(), usedAt: new Date() }]
  ])('refuses %s', async (_label, record) => {
    prismaMock.passwordReset.findUnique.mockResolvedValue(record);
    const res = await request(app).post('/auth/reset-password').send({ token: 'tok', password: 'NewPassword123' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('single use holds under a race: if the token was consumed in between, no password change', async () => {
    prismaMock.passwordReset.findUnique.mockResolvedValue({
      id: 3, userId: 10, expiresAt: inFuture(), usedAt: null
    });
    prismaMock.passwordReset.updateMany.mockResolvedValue({ count: 0 }); // une autre requête l'a déjà pris

    const res = await request(app).post('/auth/reset-password').send({ token: 'tok', password: 'NewPassword123' });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
