import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d'
};

export const EMAIL_CONFIG = {
  FROM: 'onboarding@resend.dev'
};
