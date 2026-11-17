import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, verifyRefreshToken, safeEqual, hashToken } from '../utils';
import { issueSession, revokeAllSessions } from '../services/session.service';
import { logFailedLogin, logUserLogin, logUserLogout, logRefreshTokenReuse } from '../services/audit.service';
import { AuthRequest, CreateUserRequest } from '../types';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// Hash factice comparé quand l'email n'existe pas (temps de réponse identique)
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 10);

/**
 * VULN-001 : le bootstrap n'est ouvert qu'à qui détient SUPERADMIN_BOOTSTRAP_TOKEN
 * (en-tête X-Bootstrap-Token). Sans ce secret configuré, la route est fermée, quel que soit
 * NODE_ENV : avant, une base vide sans NODE_ENV=production laissait le premier venu
 * (ou deux attaquants en même temps) devenir SuperAdmin.
 */
const MIN_BOOTSTRAP_TOKEN_LENGTH = 32;

function isBootstrapAuthorized(req: Request): boolean {
  const expected = process.env.SUPERADMIN_BOOTSTRAP_TOKEN;
  if (!expected || expected.length < MIN_BOOTSTRAP_TOKEN_LENGTH) return false;
  return safeEqual(req.get('X-Bootstrap-Token') ?? '', expected);
}

// Un seul bootstrap à la fois dans ce processus : un double envoi légitime ne crée pas deux SuperAdmins
let bootstrapInProgress = false;

// Créer un Super Admin (une seule fois)
export const createSuperAdmin = async (req: Request, res: Response) => {
  // Même réponse que le secret soit absent ou faux : on ne révèle pas la configuration
  if (!isBootstrapAuthorized(req)) {
    return res.status(403).json({ error: 'SuperAdmin bootstrap is disabled' });
  }
  if (bootstrapInProgress) {
    return res.status(409).json({ error: 'SuperAdmin bootstrap already in progress' });
  }

  bootstrapInProgress = true;
  try {
    const { email, password } = req.body as CreateUserRequest;

    // Vérifier si un SuperAdmin existe déjà
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: { name: 'SuperAdmin' } }
    });

    if (existingSuperAdmin) {
      return res.status(400).json({ error: 'SuperAdmin already exists' });
    }

    // Vérifier l'email
    if (!email || email.trim().length === 0) {
      return res.status(400).json({ error: 'Email required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Récupérer le rôle SuperAdmin
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SuperAdmin' } });
    if (!superAdminRole) {
      return res.status(500).json({ error: 'SuperAdmin role not found' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Créer le user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        roleId: superAdminRole.id,
        emailVerified: true
      },
      include: { role: true }
    });

    const { accessToken, refreshToken } = await issueSession({ id: user.id, email: user.email, role: user.role.name });

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create super admin' });
  } finally {
    bootstrapInProgress = false;
  }
};

// Login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as AuthRequest;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Récupérer l'user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });

    // Toujours comparer un hash (même factice) : le temps de réponse ne révèle pas si l'email existe
    const validPassword = await comparePassword(password, user?.password ?? DUMMY_HASH);
    if (!user || !validPassword) {
      await logFailedLogin(email, req.ip); // VULN-005 : la force brute laisse une trace
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Vérifié APRÈS le mot de passe : sans le bon mot de passe, on ne révèle pas qu'un compte est désactivé
    if (!user.isActive) {
      await logFailedLogin(email, req.ip);
      return res.status(401).json({ error: 'User account is disabled' });
    }

    const { accessToken, refreshToken } = await issueSession({ id: user.id, email: user.email, role: user.role.name });
    await logUserLogin(user.id, req.ip);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Vérifier le token
    const payload = verifyRefreshToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // En base, seule l'empreinte du token est stockée (VULN-004)
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token: hashToken(token) }
    });

    if (!dbToken || dbToken.userId !== payload.userId || dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    // VULN-003 : un token déjà révoqué qui revient = il a été volé (ou rejoué).
    // On coupe toutes les sessions de l'utilisateur : l'attaquant perd l'accès, la victime se reconnecte.
    if (dbToken.revokedAt) {
      await revokeAllSessions(dbToken.userId);
      await logRefreshTokenReuse(dbToken.userId, req.ip);
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    // VULN-003 : rotation atomique. Le token n'est "consommé" que s'il est encore actif :
    // sur N requêtes simultanées, une seule passe, les autres sont traitées comme une réutilisation.
    const consumed = await prisma.refreshToken.updateMany({
      where: { id: dbToken.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (consumed.count === 0) {
      await revokeAllSessions(user.id);
      await logRefreshTokenReuse(user.id, req.ip);
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    const tokens = await issueSession({ id: user.id, email: user.email, role: user.role.name });
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// Logout (révoquer le refresh token)
export const logout = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Révoquer la session : ses access tokens sont refusés immédiatement (VULN-002)
    const session = await prisma.refreshToken.findUnique({ where: { token: hashToken(token) } });
    if (session && !session.revokedAt) {
      await prisma.refreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      await logUserLogout(session.userId, req.ip); // VULN-005
    }

    // Même réponse si le token est inconnu : on ne révèle rien
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};
