import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Min 8 caractères'),
  roleId: z.number().int().min(1, 'Rôle invalide'),
});

export const UpdateUserRoleSchema = z.object({
  roleId: z.number().int().min(1, 'Rôle invalide'),
});

export const UpdateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
