import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/errorHandler';
import * as ticketService from '../services/ticket.service';

function actorOf(req: Request): ticketService.Actor {
  return { userId: req.userId as number, role: req.role as string };
}

export const listTickets = asyncHandler(async (req: Request, res: Response) => {
  const result = await ticketService.listTickets(actorOf(req), res.locals.query);
  res.json(result);
});

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  const { ticket, aiReply } = await ticketService.createTicket(actorOf(req), res.locals.body);
  res.status(201).json({ data: ticket, aiReply });
});

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await ticketService.listMessages(actorOf(req), res.locals.params.id);
  res.json({ data: messages });
});

export const addMessage = asyncHandler(async (req: Request, res: Response) => {
  const message = await ticketService.addMessage(actorOf(req), res.locals.params.id, res.locals.body.content);
  res.status(201).json({ data: message });
});

export const getTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.getTicket(actorOf(req), res.locals.params.id);
  res.json({ data: ticket });
});

export const updateTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticket = await ticketService.updateTicket(actorOf(req), res.locals.params.id, res.locals.body);
  res.json({ data: ticket });
});
