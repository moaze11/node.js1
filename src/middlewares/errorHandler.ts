import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Validation error
  if (err.name === 'ZodError') {
    // Zod v4 expose les erreurs dans `issues` (plus `errors`)
    const issues = err.issues ?? err.errors ?? [];
    return res.status(400).json({
      error: 'Validation Error',
      details: issues.map((i: any) => ({ path: (i.path ?? []).join('.'), message: i.message })),
      statusCode: 400
    });
  }

  // JSON invalide ou corps trop gros (body-parser) : erreur client, pas 500
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body', statusCode: 400 });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large', statusCode: 413 });
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Unique constraint violation',
      statusCode: 409
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found',
      statusCode: 404
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      statusCode: 401
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      statusCode: 401
    });
  }

  // Operational error
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode
    });
  }

  // Programming error - don't leak details
  console.error('ERROR:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    statusCode: 500
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
