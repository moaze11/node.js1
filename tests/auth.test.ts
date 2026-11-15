import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateAccessToken, verifyAccessToken } from '../src/utils';

const prisma = new PrismaClient();

describe('Auth Service', () => {
  describe('Password hashing', () => {
    it('should hash password and verify it', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);

      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await comparePassword('wrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('JWT Tokens', () => {
    it('should generate and verify access token', () => {
      const payload = {
        userId: 1,
        email: 'test@test.com',
        role: 'SuperAdmin'
      };

      const token = generateAccessToken(payload);
      expect(token).toBeDefined();

      const verified = verifyAccessToken(token);
      expect(verified).toBeDefined();
      expect(verified?.userId).toBe(1);
      expect(verified?.email).toBe('test@test.com');
    });

    it('should return null for invalid token', () => {
      const verified = verifyAccessToken('invalid.token.here');
      expect(verified).toBeNull();
    });
  });

  describe('Database operations', () => {
    beforeAll(async () => {
      await prisma.user.deleteMany();
      await prisma.role.deleteMany();
    });

    it('should create and find a user', async () => {
      // Create role
      const role = await prisma.role.create({
        data: { name: 'TestRole', description: 'Test' }
      });

      // Create user
      const hashedPassword = await hashPassword('testPassword123');
      const user = await prisma.user.create({
        data: {
          email: 'test@test.com',
          password: hashedPassword,
          roleId: role.id
        }
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('test@test.com');

      // Find user
      const foundUser = await prisma.user.findUnique({
        where: { email: 'test@test.com' }
      });

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(user.id);
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });
  });
});
