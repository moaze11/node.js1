import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuditLog {
  action: string;
  userId?: number;
  targetUserId?: number;
  changes?: Record<string, any>;
  ip?: string;
  timestamp?: Date;
}

// In-memory audit logs (in production, use a database or external service)
const auditLogs: AuditLog[] = [];

export async function logAudit(log: AuditLog) {
  const auditEntry = {
    ...log,
    timestamp: new Date()
  };

  auditLogs.push(auditEntry);

  // Keep only last 1000 logs in memory
  if (auditLogs.length > 1000) {
    auditLogs.shift();
  }

  console.log('[AUDIT]', JSON.stringify(auditEntry));
}

export async function getAuditLogs(limit: number = 100) {
  return auditLogs.slice(-limit).reverse();
}

// Log sensitive actions
export async function logUserCreated(userId: number, email: string, ip?: string) {
  await logAudit({
    action: 'USER_CREATED',
    userId,
    changes: { email },
    ip
  });
}

export async function logUserLogin(userId: number, ip?: string) {
  await logAudit({
    action: 'USER_LOGIN',
    userId,
    ip
  });
}

export async function logUserLogout(userId: number, ip?: string) {
  await logAudit({
    action: 'USER_LOGOUT',
    userId,
    ip
  });
}

export async function logRoleAssigned(adminId: number, targetUserId: number, roleId: number, ip?: string) {
  await logAudit({
    action: 'ROLE_ASSIGNED',
    userId: adminId,
    targetUserId,
    changes: { roleId },
    ip
  });
}

export async function logUserStatusChanged(adminId: number, targetUserId: number, isActive: boolean, ip?: string) {
  await logAudit({
    action: 'USER_STATUS_CHANGED',
    userId: adminId,
    targetUserId,
    changes: { isActive },
    ip
  });
}

export async function logPasswordReset(userId: number, ip?: string) {
  await logAudit({
    action: 'PASSWORD_RESET',
    userId,
    ip
  });
}

export async function logFailedLogin(email: string, ip?: string) {
  await logAudit({
    action: 'FAILED_LOGIN',
    changes: { email },
    ip
  });
}
