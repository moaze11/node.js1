import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './utils';

// Interface pour enrichir Request
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      email?: string;
      role?: string;
    }
  }
}

// Middleware : Vérifier le token d'accès
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7); // Remove "Bearer "
    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    // Enrichir la requête avec les données du token
    req.userId = payload.userId;
    req.email = payload.email;
    req.role = payload.role;

    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Middleware : Vérifier un rôle spécifique
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role || !allowedRoles.includes(req.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Only ${allowedRoles.join(', ')} can access this endpoint`
      });
    }
    next();
  };
}

// Middleware : SuperAdmin seulement
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.role !== 'SuperAdmin') {
    return res.status(403).json({ error: 'Only SuperAdmin can access this endpoint' });
  }
  next();
}

// Middleware : Admin ou SuperAdmin
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.role || !['SuperAdmin', 'Admin'].includes(req.role)) {
    return res.status(403).json({ error: 'Only Admin or SuperAdmin can access this endpoint' });
  }
  next();
}

// Middleware : Agent ou plus
export function requireAgent(req: Request, res: Response, next: NextFunction) {
  if (!req.role || !['SuperAdmin', 'Admin', 'Agent'].includes(req.role)) {
    return res.status(403).json({ error: 'Only Agent, Admin or SuperAdmin can access this endpoint' });
  }
  next();
}
