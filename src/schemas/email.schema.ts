import { z } from 'zod';

export const InviteSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const AcceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: z.string().min(8, 'Min 8 caractères'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  password: z.string().min(8, 'Min 8 caractères'),
});

export type InviteInput = z.infer<typeof InviteSchema>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;
