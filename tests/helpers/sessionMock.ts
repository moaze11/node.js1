// Comptes "en base" utilisés par les tests HTTP (le middleware relit le rôle en base à chaque requête)
const ROLES: Record<number, string> = { 1: 'SuperAdmin', 2: 'Admin', 20: 'Agent', 10: 'User', 11: 'User' };

// Seule la relecture de session est simulée (toute session de test est active).
// La vérification réelle de la session (VULN-002) est testée dans security.test.ts.
export const getSessionUser = jest.fn(async (userId: number, _sessionId: number) =>
  ROLES[userId] ? { email: `${ROLES[userId].toLowerCase()}${userId}@test.com`, role: ROLES[userId] } : null
);

// Création et révocation de sessions : vraies fonctions (sur le Prisma mocké)
const actual = jest.requireActual('../../src/services/session.service');
export const issueSession = actual.issueSession;
export const revokeAllSessions = actual.revokeAllSessions;
