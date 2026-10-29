import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './utils';

const prisma = new PrismaClient();

// ========== SUPER ADMIN ONLY ==========

// SuperAdmin : Créer un user directement (sans invitation)
export const createUserAsSuperAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password, roleId } = req.body;

    if (!email || !password || !roleId) {
      return res.status(400).json({ error: 'Email, password, and roleId required' });
    }

    // Vérifier que le rôle existe
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(400).json({ error: 'Role not found' });
    }

    // Vérifier que l'email n'existe pas
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        roleId,
        emailVerified: true
      },
      include: { role: true }
    });

    res.status(201).json({
      message: 'User created by SuperAdmin',
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// SuperAdmin : Assigner un rôle à un user
export const assignRole = async (req: Request, res: Response) => {
  try {
    const { userId, roleId } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({ error: 'userId and roleId required' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return res.status(400).json({ error: 'Role not found' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: true }
    });

    res.json({
      message: 'Role assigned',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role.name
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role' });
  }
};

// SuperAdmin : Disable/Enable un user
export const toggleUserStatus = async (req: Request, res: Response) => {
  try {
    const { userId, isActive } = req.body;

    if (userId === undefined || isActive === undefined) {
      return res.status(400).json({ error: 'userId and isActive required' });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive },
      include: { role: true }
    });

    res.json({
      message: `User ${isActive ? 'activated' : 'disabled'}`,
      user: {
        id: user.id,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
};

// ========== ADMIN ONLY ==========

// Admin : Lister tous les users
export const listAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true }
    });

    res.json({
      message: 'Users list',
      total: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list users' });
  }
};

// ========== AGENT ONLY ==========

// Agent : Voir les tickets (mock)
export const viewTickets = async (req: Request, res: Response) => {
  try {
    res.json({
      message: 'Tickets list (agent can view)',
      tickets: [
        { id: 1, title: 'Ticket 1', status: 'open' },
        { id: 2, title: 'Ticket 2', status: 'in_progress' }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to view tickets' });
  }
};

// ========== ALL AUTHENTICATED USERS ==========

// Récupérer son profil
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get profile' });
  }
};

// Récupérer les rôles disponibles
export const getRoles = async (req: Request, res: Response) => {
  try {
    const roles = await prisma.role.findMany();
    res.json({ roles });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get roles' });
  }
};
