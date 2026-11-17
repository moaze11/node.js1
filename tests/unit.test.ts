import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../src/utils';
import {
  buildAccessWhere,
  buildListWhere,
  canUpdateTicket,
  canViewTicket
} from '../src/services/ticket.service';
import { ListTicketsQuerySchema, CreateTicketSchema, UpdateTicketSchema } from '../src/schemas/ticket.schema';

jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => ({})), Prisma: {} }));

describe('Password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('testPassword123');
    expect(hash).not.toBe('testPassword123');
    expect(await comparePassword('testPassword123', hash)).toBe(true);
    expect(await comparePassword('wrongPassword', hash)).toBe(false);
  });

  it('salts: same password gives different hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });
});

describe('JWT tokens', () => {
  it('generates and verifies an access token (userId stays a number)', () => {
    const token = generateAccessToken({ userId: 1, email: 'a@b.com', role: 'Admin', sid: 1 });
    const payload = verifyAccessToken(token);
    expect(payload?.userId).toBe(1);
    expect(typeof payload?.userId).toBe('number');
    expect(payload?.role).toBe('Admin');
  });

  it('rejects an invalid or tampered token', () => {
    expect(verifyAccessToken('invalid.token.here')).toBeNull();
    const token = generateAccessToken({ userId: 1, email: 'a@b.com', role: 'User', sid: 1 });
    expect(verifyAccessToken(token.slice(0, -2) + 'xx')).toBeNull();
  });

  it('refresh tokens are unique even when issued in the same second', () => {
    const a = generateRefreshToken(1);
    const b = generateRefreshToken(1);
    expect(a).not.toBe(b);
    expect(verifyRefreshToken(a)?.userId).toBe(1);
  });

  it('an access token is not accepted as a refresh token', () => {
    const access = generateAccessToken({ userId: 1, email: 'a@b.com', role: 'User', sid: 1 });
    expect(verifyRefreshToken(access)).toBeNull();
  });
});

describe('Ticket access rules', () => {
  const own = { ownerId: 10, assigneeId: null };
  const assignedToAgent = { ownerId: 10, assigneeId: 20 };
  const assignedToOther = { ownerId: 10, assigneeId: 99 };

  it('SuperAdmin and Admin see everything', () => {
    expect(buildAccessWhere({ userId: 1, role: 'SuperAdmin' })).toEqual({});
    expect(buildAccessWhere({ userId: 2, role: 'Admin' })).toEqual({});
    expect(canViewTicket({ userId: 2, role: 'Admin' }, assignedToOther)).toBe(true);
  });

  it('Agent sees tickets assigned to them and unassigned ones only', () => {
    const agent = { userId: 20, role: 'Agent' };
    expect(buildAccessWhere(agent)).toEqual({ OR: [{ assigneeId: 20 }, { assigneeId: null }] });
    expect(canViewTicket(agent, assignedToAgent)).toBe(true);
    expect(canViewTicket(agent, own)).toBe(true);
    expect(canViewTicket(agent, assignedToOther)).toBe(false);
    expect(canUpdateTicket(agent, assignedToOther)).toBe(false);
  });

  it('User sees only their own tickets and cannot update', () => {
    const user = { userId: 10, role: 'User' };
    const stranger = { userId: 11, role: 'User' };
    expect(buildAccessWhere(user)).toEqual({ ownerId: 10 });
    expect(canViewTicket(user, own)).toBe(true);
    expect(canViewTicket(stranger, own)).toBe(false);
    expect(canUpdateTicket(user, own)).toBe(false);
  });

  it('unknown role falls back to the most restrictive rule', () => {
    expect(buildAccessWhere({ userId: 5, role: 'Hacker' })).toEqual({ ownerId: 5 });
  });

  it('filters are combined with the access rule (never replace it)', () => {
    const query = ListTicketsQuerySchema.parse({ status: 'open', search: 'printer' });
    const where = buildListWhere({ userId: 10, role: 'User' }, query) as any;
    expect(where.AND[0]).toEqual({ ownerId: 10 });
    expect(where.AND).toContainEqual({ status: 'open' });
    expect(where.AND).toContainEqual({
      OR: [{ title: { contains: 'printer' } }, { description: { contains: 'printer' } }]
    });
  });
});

describe('Ticket input validation', () => {
  it('applies pagination and sort defaults', () => {
    expect(ListTicketsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' });
  });

  it('coerces query strings to numbers', () => {
    expect(ListTicketsQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it.each([
    [{ limit: '1000' }],
    [{ page: '0' }],
    [{ page: '-1' }],
    [{ status: 'deleted' }],
    [{ sortBy: 'password' }],
    [{ sortBy: 'createdAt; DROP TABLE Ticket' }],
    [{ order: 'sideways' }]
  ])('rejects invalid query %j', (input) => {
    expect(ListTicketsQuerySchema.safeParse(input).success).toBe(false);
  });

  it('validates ticket creation', () => {
    expect(CreateTicketSchema.safeParse({ title: 'ok' }).success).toBe(false);
    expect(CreateTicketSchema.safeParse({ title: 'Printer broken' }).success).toBe(true);
    expect(CreateTicketSchema.safeParse({ title: 'Printer broken', priority: 'urgent' }).success).toBe(false);
  });

  it('rejects an empty ticket update', () => {
    expect(UpdateTicketSchema.safeParse({}).success).toBe(false);
  });
});
