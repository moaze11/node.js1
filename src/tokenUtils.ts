import crypto from 'crypto';

// Générer un token aléatoire
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Expiration tokens (en millisecondes)
export const TOKEN_EXPIRY = {
  INVITATION: 7 * 24 * 60 * 60 * 1000,  // 7 jours
  PASSWORD_RESET: 1 * 60 * 60 * 1000,   // 1 heure
};

export function getExpiryDate(expiryMs: number): Date {
  return new Date(Date.now() + expiryMs);
}
