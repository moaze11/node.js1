// Comptes "en base" utilisés par les tests HTTP (le middleware relit le rôle en base à chaque requête)
const ROLES: Record<number, string> = { 1: 'SuperAdmin', 2: 'Admin', 20: 'Agent', 10: 'User', 11: 'User' };

export const getSessionUser = jest.fn(async (userId: number) =>
  ROLES[userId] ? { email: `${ROLES[userId].toLowerCase()}${userId}@test.com`, role: ROLES[userId] } : null
);
