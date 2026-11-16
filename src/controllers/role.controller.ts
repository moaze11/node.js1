import { Request, Response } from 'express';
import { prisma } from '../types/config';
import { hashPassword } from '../utils';
import { AppError, asyncHandler } from '../middlewares/errorHandler';
import { logRoleAssigned, logUserCreated, logUserStatusChanged } from '../services/audit.service';

// Champs publics d'un user : jamais le hash du mot de passe
const publicUserSelect = {
  id: true,
  email: true,
  isActive: true,
  emailVerified: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

// ========== SUPER ADMIN ONLY ==========

// SuperAdmin : Créer un user directement (sans invitation)
export const createUserAsSuperAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, roleId } = res.locals.body;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError('Role not found', 400);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new AppError('User already exists', 409);

  const user = await prisma.user.create({
    data: { email, password: await hashPassword(password), roleId, emailVerified: true },
    select: publicUserSelect,
  });

  await logUserCreated(req.userId as number, user.id, user.email, req.ip);
  res.status(201).json({ message: 'User created by SuperAdmin', data: user });
});

// SuperAdmin : Assigner un rôle à un user
export const assignRole = asyncHandler(async (req: Request, res: Response) => {
  const userId: number = res.locals.params.id;
  const { roleId } = res.locals.body;

  if (userId === req.userId) throw new AppError('You cannot change your own role', 400);

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) throw new AppError('User not found', 404);

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new AppError('Role not found', 400);

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { roleId },
    select: publicUserSelect,
  });

  await logRoleAssigned(req.userId as number, userId, user.role.name, role.name, req.ip);
  res.json({ message: 'Role assigned', data: updatedUser });
});

// SuperAdmin : Désactiver / réactiver un user
export const toggleUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId: number = res.locals.params.id;
  const { isActive } = res.locals.body;

  if (userId === req.userId) throw new AppError('You cannot change your own status', 400);

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new AppError('User not found', 404);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: publicUserSelect,
  });

  // Compte désactivé : on coupe ses sessions (refresh tokens révoqués)
  if (!isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await logUserStatusChanged(req.userId as number, userId, isActive, req.ip);
  res.json({ message: `User ${isActive ? 'activated' : 'disabled'}`, data: user });
});

// ========== ADMIN ONLY ==========

// Admin : Lister tous les users (sans les mots de passe)
export const listAllUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ select: publicUserSelect, orderBy: { id: 'asc' } });
  res.json({ message: 'Users list', total: users.length, data: users });
});

// ========== ALL AUTHENTICATED USERS ==========

// Récupérer son profil
export const getMyProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUserSelect });
  if (!user) throw new AppError('User not found', 404);
  res.json({ data: user });
});

// Récupérer les rôles disponibles
export const getRoles = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await prisma.role.findMany();
  res.json({ data: roles });
});
