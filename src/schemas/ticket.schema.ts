import { z } from 'zod';

export const TICKET_STATUSES = ['open', 'in_progress', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;
// Whitelist : seuls ces champs peuvent servir au tri (pas d'injection via ?sortBy=)
export const TICKET_SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'status', 'priority'] as const;

export const ListTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigneeId: z.coerce.number().int().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sortBy: z.enum(TICKET_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const CreateTicketSchema = z.object({
  title: z.string().trim().min(3, 'Min 3 caractères').max(200),
  description: z.string().trim().max(5000).default(''),
  priority: z.enum(TICKET_PRIORITIES).default('medium'),
});

export const UpdateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    assigneeId: z.number().int().min(1).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Au moins un champ requis' });

export const CreateMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message vide').max(5000),
});

export const IdParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
