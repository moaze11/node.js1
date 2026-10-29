import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from './utils';
import { AuthRequest, CreateUserRequest } from './types';

const prisma = new PrismaClient();

// Créer un Super Admin (une seule fois)
export const createSuperAdmin = async (req: Request, res: Response) => {
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

    // Générer tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role.name
    });
    const refreshToken = generateRefreshToken(user.id);

    // Sauvegarder le refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

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

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is disabled' });
    }

    // Vérifier le password
    const validPassword = await comparePassword(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Générer tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role.name
    });
    const refreshToken = generateRefreshToken(user.id);

    // Sauvegarder le refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

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

    // Vérifier si le token existe en DB
    const dbToken = await prisma.refreshToken.findUnique({
      where: { token }
    });

    if (!dbToken || dbToken.revokedAt) {
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    // Récupérer l'user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { role: true }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    // Générer nouveau access token
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role.name
    });

    res.json({ accessToken: newAccessToken });
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

    // Révoquer le token
    await prisma.refreshToken.updateMany({
      where: { token },
      data: { revokedAt: new Date() }
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
};
