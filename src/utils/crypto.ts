import bcryptjs from 'bcryptjs';
import crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

/**
 * Compare deux secrets en temps constant (pas de fuite par le temps de réponse).
 * Les deux valeurs sont hachées d'abord : timingSafeEqual exige des longueurs égales,
 * et comparer les longueurs brutes révélerait celle du secret.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
