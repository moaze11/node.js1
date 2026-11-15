import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId?: number;
  email?: string;
  role?: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  details?: any;
}
