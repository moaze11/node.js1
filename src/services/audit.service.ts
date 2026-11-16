import { prisma } from '../types/config';

export interface AuditEntry {
  action: string;
  userId?: number; // acteur
  targetUserId?: number;
  changes?: Record<string, unknown>;
  ip?: string;
}

/**
 * Écrit un audit log en base. Une panne d'audit ne doit pas faire échouer l'action métier,
 * mais elle doit être visible : on la trace dans la console.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.userId ?? null,
        targetUserId: entry.targetUserId ?? null,
        changes: entry.changes ? JSON.stringify(entry.changes) : null,
        ip: entry.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[AUDIT] write failed', entry.action, error);
  }
}

export async function getAuditLogs(page = 1, limit = 50, action?: string) {
  const where = action ? { action } : {};
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ]);
  return {
    data: rows.map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : null })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export const logUserCreated = (actorId: number, targetUserId: number, email: string, ip?: string) =>
  logAudit({ action: 'USER_CREATED', userId: actorId, targetUserId, changes: { email }, ip });

export const logUserLogin = (userId: number, ip?: string) => logAudit({ action: 'USER_LOGIN', userId, ip });

export const logUserLogout = (userId: number, ip?: string) => logAudit({ action: 'USER_LOGOUT', userId, ip });

export const logRoleAssigned = (actorId: number, targetUserId: number, from: string, to: string, ip?: string) =>
  logAudit({ action: 'ROLE_ASSIGNED', userId: actorId, targetUserId, changes: { from, to }, ip });

export const logUserStatusChanged = (actorId: number, targetUserId: number, isActive: boolean, ip?: string) =>
  logAudit({ action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED', userId: actorId, targetUserId, changes: { isActive }, ip });

export const logPasswordReset = (userId: number, ip?: string) => logAudit({ action: 'PASSWORD_RESET', userId, ip });

export const logFailedLogin = (email: string, ip?: string) =>
  logAudit({ action: 'FAILED_LOGIN', changes: { email }, ip });
