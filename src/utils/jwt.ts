import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { TokenPayload } from '../types';

// Pas de valeur par défaut : sans secret (ou avec un secret faible), l'app refuse de démarrer.
// Un repli du type 'secret' permettrait à n'importe qui de forger des tokens.
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set and at least 32 characters long`);
  }
  return value;
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const JWT_REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: number): string {
  // jti aléatoire : deux tokens émis dans la même seconde restent différents (rotation)
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d', jwtid: randomUUID() });
}

export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: number };
  } catch {
    return null;
  }
}
