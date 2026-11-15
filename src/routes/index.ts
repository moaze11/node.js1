import { Router } from 'express';
import { createSuperAdmin, login, refreshToken, logout } from '../controllers/auth.controller';
import { inviteUser, acceptInvitation, forgotPassword, resetPassword } from '../controllers/email.controller';
import {
  createUserAsSuperAdmin,
  assignRole,
  toggleUserStatus,
  listAllUsers,
  viewTickets,
  getMyProfile,
  getRoles
} from '../controllers/role.controller';
import {
  authMiddleware,
  requireSuperAdmin,
  requireAdmin,
  requireAgent
} from '../middlewares/auth.middleware';

const router = Router();

// Auth Routes
router.post('/auth/super-admin', createSuperAdmin);
router.post('/auth/login', login);
router.post('/auth/refresh', refreshToken);
router.post('/auth/logout', logout);

// Email Routes
router.post('/auth/invite', inviteUser);
router.post('/auth/accept-invitation', acceptInvitation);
router.post('/auth/forgot-password', forgotPassword);
router.post('/auth/reset-password', resetPassword);

// User Routes
router.get('/user/profile', authMiddleware, getMyProfile);
router.get('/user/roles', authMiddleware, getRoles);

// Admin Routes
router.post('/admin/users', authMiddleware, requireSuperAdmin, createUserAsSuperAdmin);
router.patch('/admin/users/:id/role', authMiddleware, requireSuperAdmin, assignRole);
router.patch('/admin/users/:id/status', authMiddleware, requireSuperAdmin, toggleUserStatus);
router.get('/admin/users', authMiddleware, requireAdmin, listAllUsers);

// Agent Routes
router.get('/agent/tickets', authMiddleware, requireAgent, viewTickets);

export default router;
