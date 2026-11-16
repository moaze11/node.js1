import { Router } from 'express';
import { z } from 'zod';
import { createSuperAdmin, login, refreshToken, logout } from '../controllers/auth.controller';
import { inviteUser, acceptInvitation, forgotPassword, resetPassword } from '../controllers/email.controller';
import {
  createUserAsSuperAdmin,
  assignRole,
  toggleUserStatus,
  listAllUsers,
  getMyProfile,
  getRoles
} from '../controllers/role.controller';
import {
  listTickets,
  createTicket,
  getTicket,
  updateTicket,
  listMessages,
  addMessage
} from '../controllers/ticket.controller';
import {
  authMiddleware,
  requireSuperAdmin,
  requireAdmin,
  requireAgent
} from '../middlewares/auth.middleware';
import { loginRateLimit, sensitiveRateLimit, ticketCreateRateLimit } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { asyncHandler } from '../middlewares/errorHandler';
import {
  AcceptInvitationSchema,
  CreateUserSchema,
  ForgotPasswordSchema,
  InviteSchema,
  LoginSchema,
  LogoutSchema,
  RefreshTokenSchema,
  ResetPasswordSchema,
  SuperAdminSchema,
  UpdateUserRoleSchema,
  UpdateUserStatusSchema
} from '../schemas';
import {
  CreateMessageSchema,
  CreateTicketSchema,
  IdParamSchema,
  ListTicketsQuerySchema,
  UpdateTicketSchema
} from '../schemas/ticket.schema';
import { getAuditLogs } from '../services/audit.service';

const router = Router();

// Auth Routes (bootstrap SuperAdmin : refusé dès qu'un SuperAdmin existe)
router.post('/auth/super-admin', sensitiveRateLimit, validate(SuperAdminSchema), createSuperAdmin);
router.post('/auth/login', loginRateLimit, validate(LoginSchema), login);
router.post('/auth/refresh', validate(RefreshTokenSchema), refreshToken);
router.post('/auth/logout', validate(LogoutSchema), logout);

// Email Routes (invitation réservée aux admins : pas d'inscription publique)
router.post('/auth/invite', authMiddleware, requireAdmin, validate(InviteSchema), inviteUser);
router.post('/auth/accept-invitation', sensitiveRateLimit, validate(AcceptInvitationSchema), acceptInvitation);
router.post('/auth/forgot-password', sensitiveRateLimit, validate(ForgotPasswordSchema), forgotPassword);
router.post('/auth/reset-password', sensitiveRateLimit, validate(ResetPasswordSchema), resetPassword);

// User Routes
router.get('/user/profile', authMiddleware, getMyProfile);
router.get('/user/roles', authMiddleware, getRoles);

// Admin Routes
router.post('/admin/users', authMiddleware, requireSuperAdmin, validate(CreateUserSchema), createUserAsSuperAdmin);
router.patch(
  '/admin/users/:id/role',
  authMiddleware,
  requireSuperAdmin,
  validate(IdParamSchema, 'params'),
  validate(UpdateUserRoleSchema),
  assignRole
);
router.patch(
  '/admin/users/:id/status',
  authMiddleware,
  requireSuperAdmin,
  validate(IdParamSchema, 'params'),
  validate(UpdateUserStatusSchema),
  toggleUserStatus
);
router.get('/admin/users', authMiddleware, requireAdmin, listAllUsers);

const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  action: z.string().regex(/^[A-Z_]{1,50}$/).optional()
});
router.get(
  '/admin/audit-logs',
  authMiddleware,
  requireSuperAdmin,
  validate(AuditQuerySchema, 'query'),
  asyncHandler(async (_req: any, res: any) => {
    const { page, limit, action } = res.locals.query;
    res.json(await getAuditLogs(page, limit, action));
  })
);

// Ticket Routes (règles d'accès appliquées dans ticket.service)
router.get('/tickets', authMiddleware, validate(ListTicketsQuerySchema, 'query'), listTickets);
router.post('/tickets', authMiddleware, ticketCreateRateLimit, validate(CreateTicketSchema), createTicket);
router.get('/tickets/:id', authMiddleware, validate(IdParamSchema, 'params'), getTicket);
router.patch(
  '/tickets/:id',
  authMiddleware,
  requireAgent,
  validate(IdParamSchema, 'params'),
  validate(UpdateTicketSchema),
  updateTicket
);

// Fil de discussion du ticket (réponses de l'IA, de l'utilisateur et des agents)
router.get('/tickets/:id/messages', authMiddleware, validate(IdParamSchema, 'params'), listMessages);
router.post(
  '/tickets/:id/messages',
  authMiddleware,
  validate(IdParamSchema, 'params'),
  validate(CreateMessageSchema),
  addMessage
);

// Ancienne route agent conservée : même listing, filtré par les règles d'accès
router.get('/agent/tickets', authMiddleware, requireAgent, validate(ListTicketsQuerySchema, 'query'), listTickets);

export default router;
