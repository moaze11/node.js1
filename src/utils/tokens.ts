import crypto from 'crypto';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export const TOKEN_EXPIRY = {
  INVITATION: 7 * 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 1 * 60 * 60 * 1000,
};

export function getExpiryDate(expiryMs: number): Date {
  return new Date(Date.now() + expiryMs);
}
