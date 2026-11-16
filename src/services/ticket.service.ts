import { Prisma } from '@prisma/client';
import { prisma } from '../types/config';
import { AppError } from '../middlewares/errorHandler';
import { ListTicketsQuery, CreateTicketInput, UpdateTicketInput } from '../schemas/ticket.schema';
import { triageTicket, statusForCategory } from './ai.service';

export interface Actor {
  userId: number;
  role: string;
}

const STAFF_ROLES = ['SuperAdmin', 'Admin'];

/**
 * Règles d'accès aux tickets :
 * - SuperAdmin / Admin : tous les tickets
 * - Agent : tickets qui lui sont assignés + tickets non assignés (à prendre en charge)
 * - User : uniquement ses propres tickets
 */
export function buildAccessWhere(actor: Actor): Prisma.TicketWhereInput {
  if (STAFF_ROLES.includes(actor.role)) return {};
  if (actor.role === 'Agent') {
    return { OR: [{ assigneeId: actor.userId }, { assigneeId: null }] };
  }
  return { ownerId: actor.userId };
}

export function canViewTicket(actor: Actor, ticket: { ownerId: number; assigneeId: number | null }): boolean {
  if (STAFF_ROLES.includes(actor.role)) return true;
  if (actor.role === 'Agent') return ticket.assigneeId === actor.userId || ticket.assigneeId === null;
  return ticket.ownerId === actor.userId;
}

/** Un User ne peut pas modifier un ticket ; un Agent seulement ceux qui lui sont assignés (ou non assignés). */
export function canUpdateTicket(actor: Actor, ticket: { ownerId: number; assigneeId: number | null }): boolean {
  if (STAFF_ROLES.includes(actor.role)) return true;
  if (actor.role === 'Agent') return ticket.assigneeId === actor.userId || ticket.assigneeId === null;
  return false;
}

export function buildListWhere(actor: Actor, query: ListTicketsQuery): Prisma.TicketWhereInput {
  const filters: Prisma.TicketWhereInput[] = [buildAccessWhere(actor)];
  if (query.status) filters.push({ status: query.status });
  if (query.priority) filters.push({ priority: query.priority });
  if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });
  if (query.search) {
    filters.push({ OR: [{ title: { contains: query.search } }, { description: { contains: query.search } }] });
  }
  return { AND: filters };
}

export async function listTickets(actor: Actor, query: ListTicketsQuery) {
  const where = buildListWhere(actor, query);
  const [total, items] = await prisma.$transaction([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { [query.sortBy]: query.order },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    data: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Crée le ticket puis le fait trier par l'IA (statut, priorité, catégorie + réponse dans le fil).
 * Si l'IA est indisponible, le ticket est quand même créé, sans réponse IA.
 */
export async function createTicket(actor: Actor, input: CreateTicketInput) {
  const ticket = await prisma.ticket.create({
    data: { ...input, ownerId: actor.userId },
  });

  const triage = await triageTicket({ title: ticket.title, description: ticket.description });
  if (!triage) return { ticket, aiReply: null };

  const [updated, aiMessage] = await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: statusForCategory(triage.category),
        priority: triage.priority,
        category: triage.category,
      },
    }),
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, authorId: null, authorType: 'ai', content: triage.reply },
    }),
  ]);

  return { ticket: updated, aiReply: aiMessage };
}

export async function listMessages(actor: Actor, ticketId: number) {
  await getTicket(actor, ticketId); // applique les règles d'accès (404 sinon)
  return prisma.ticketMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Ajoute un message dans le fil. Peuvent écrire : le propriétaire du ticket,
 * et le staff qui a le droit de le modifier (Agent assigné / non assigné, Admin, SuperAdmin).
 * Si le propriétaire répond sur un ticket fermé, il est rouvert pour un agent.
 */
export async function addMessage(actor: Actor, ticketId: number, content: string) {
  const ticket = await getTicket(actor, ticketId);
  const isOwner = ticket.ownerId === actor.userId;
  if (!isOwner && !canUpdateTicket(actor, ticket)) throw new AppError('Forbidden', 403);

  const message = await prisma.ticketMessage.create({
    data: { ticketId, authorId: actor.userId, authorType: isOwner ? 'user' : 'agent', content },
  });

  if (isOwner && ticket.status === 'closed') {
    await prisma.ticket.update({ where: { id: ticketId }, data: { status: 'open' } });
  }

  return message;
}

export async function getTicket(actor: Actor, id: number) {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  // 404 aussi quand l'accès est refusé : on ne révèle pas l'existence du ticket
  if (!ticket || !canViewTicket(actor, ticket)) throw new AppError('Ticket not found', 404);
  return ticket;
}

export async function updateTicket(actor: Actor, id: number, input: UpdateTicketInput) {
  const ticket = await getTicket(actor, id);
  if (!canUpdateTicket(actor, ticket)) throw new AppError('Forbidden', 403);

  // Seuls Admin/SuperAdmin réassignent librement ; un Agent ne peut que se l'assigner
  if (input.assigneeId !== undefined && !STAFF_ROLES.includes(actor.role) && input.assigneeId !== actor.userId) {
    throw new AppError('Agents can only assign tickets to themselves', 403);
  }

  if (input.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId }, include: { role: true } });
    if (!assignee || !assignee.isActive || !['Agent', 'Admin', 'SuperAdmin'].includes(assignee.role.name)) {
      throw new AppError('Invalid assignee', 400);
    }
  }

  return prisma.ticket.update({ where: { id }, data: input });
}
