import { prisma } from '../types/config';
import { generateAccessToken, generateRefreshToken, hashToken, getExpiryDate, TOKEN_EXPIRY } from '../utils';

export interface SessionUser {
  email: string;
  role: string;
}

/**
 * Relit l'utilisateur ET sa session en base à chaque requête authentifiée.
 * - Compte désactivé ou rétrogradé : effet immédiat (pas d'attente de l'expiration du token).
 * - VULN-002 : session révoquée (logout, rotation, reset du mot de passe, désactivation) :
 *   l'access token qui lui est rattaché est refusé tout de suite.
 */
export async function getSessionUser(userId: number, sessionId: number): Promise<SessionUser | null> {
  const [user, session] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, isActive: true, role: { select: { name: true } } },
    }),
    prisma.refreshToken.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true },
    }),
  ]);
  if (!user || !user.isActive) return null;
  if (!session || session.userId !== userId || session.revokedAt || session.expiresAt < new Date()) return null;
  return { email: user.email, role: user.role.name };
}

/**
 * Ouvre une session : refresh token stocké haché (VULN-004), access token rattaché à la session (VULN-002).
 * Seul point de création des tokens (login, bootstrap SuperAdmin, rotation).
 */
export async function issueSession(user: { id: number; email: string; role: string }) {
  const refreshToken = generateRefreshToken(user.id);
  const session = await prisma.refreshToken.create({
    data: { token: hashToken(refreshToken), userId: user.id, expiresAt: getExpiryDate(TOKEN_EXPIRY.REFRESH) },
  });
  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role, sid: session.id });
  return { accessToken, refreshToken };
}

/** Révoque toutes les sessions actives d'un utilisateur. */
export function revokeAllSessions(userId: number) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
