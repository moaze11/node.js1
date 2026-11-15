import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

export const rateLimit = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    if (!store[identifier]) {
      store[identifier] = { count: 1, resetTime: now + windowMs };
      return next();
    }

    const { count, resetTime } = store[identifier];

    if (now > resetTime) {
      store[identifier] = { count: 1, resetTime: now + windowMs };
      return next();
    }

    if (count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil((resetTime - now) / 1000),
        statusCode: 429
      });
    }

    store[identifier].count++;
    next();
  };
};

// Strict rate limit for login attempts (5 per 15 min)
export const loginRateLimit = rateLimit(5, 15 * 60 * 1000);

// Moderate rate limit for general endpoints (100 per 15 min)
export const generalRateLimit = rateLimit(100, 15 * 60 * 1000);

// Cleanup old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 30 * 60 * 1000);
