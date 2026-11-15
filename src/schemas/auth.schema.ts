import { z } from 'zod';

export const SuperAdminSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Min 8 caractères'),
});

export const LoginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Password requis'),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Token requis'),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, 'Token requis'),
});

export type SuperAdminInput = z.infer<typeof SuperAdminSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
