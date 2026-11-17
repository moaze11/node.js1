import crypto from 'crypto';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * VULN-004 : seule l'empreinte SHA-256 d'un token secret est stockée en base.
 * Une copie de la base ne donne donc aucun token utilisable. Le token en clair ne circule
 * que dans la réponse HTTP ou l'email. SHA-256 suffit (pas besoin de bcrypt) : les tokens
 * sont longs et aléatoires, impossibles à deviner par force brute.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const TOKEN_EXPIRY = {
  INVITATION: 7 * 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 1 * 60 * 60 * 1000,
  REFRESH: 7 * 24 * 60 * 60 * 1000,
};

export function getExpiryDate(expiryMs: number): Date {
  return new Date(Date.now() + expiryMs);
}
