import { prisma } from '../types/config';

export interface SessionUser {
  email: string;
  role: string;
}

/**
 * Relit l'utilisateur en base à chaque requête authentifiée.
 * Sans ça, un compte désactivé ou rétrogradé garderait ses anciens droits
 * jusqu'à l'expiration de son access token (15 min).
 */
export async function getSessionUser(userId: number): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isActive: true, role: { select: { name: true } } },
  });
  if (!user || !user.isActive) return null;
  return { email: user.email, role: user.role.name };
}
