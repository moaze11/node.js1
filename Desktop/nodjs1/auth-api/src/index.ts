import express from 'express';
import { createSuperAdmin, login, refreshToken, logout } from './authController';
import { inviteUser, acceptInvitation, forgotPassword, resetPassword } from './emailController';
import {
  createUserAsSuperAdmin,
  assignRole,
  toggleUserStatus,
  listAllUsers,
  viewTickets,
  getMyProfile,
  getRoles
} from './roleController';
import {
  authMiddleware,
  requireSuperAdmin,
  requireAdmin,
  requireAgent
} from './middleware';

const app = express();
app.use(express.json());

// ========== PUBLIC ROUTES (No Auth) ==========
// Auth Routes
app.post('/auth/super-admin', createSuperAdmin);
app.post('/auth/login', login);
app.post('/auth/refresh', refreshToken);
app.post('/auth/logout', logout);

// Email Routes
app.post('/auth/invite', inviteUser);
app.post('/auth/accept-invitation', acceptInvitation);
app.post('/auth/forgot-password', forgotPassword);
app.post('/auth/reset-password', resetPassword);

// ========== PROTECTED ROUTES (Auth + RBAC) ==========

// User Routes (Authenticated)
app.get('/user/profile', authMiddleware, getMyProfile);
app.get('/user/roles', authMiddleware, getRoles);

// SuperAdmin Routes
app.post('/admin/users', authMiddleware, requireSuperAdmin, createUserAsSuperAdmin);
app.patch('/admin/users/:id/role', authMiddleware, requireSuperAdmin, assignRole);
app.patch('/admin/users/:id/status', authMiddleware, requireSuperAdmin, toggleUserStatus);

// Admin Routes
app.get('/admin/users', authMiddleware, requireAdmin, listAllUsers);

// Agent Routes
app.get('/agent/tickets', authMiddleware, requireAgent, viewTickets);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Auth API running on http://localhost:${PORT}`);
});
