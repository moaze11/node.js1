import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetTime: number;
}

export interface RateLimiter {
  (req: Request, res: Response, next: NextFunction): void;
  reset: () => void;
}

/**
 * Limiteur en mémoire, par IP. Chaque limiteur a SON propre compteur
 * (avant, tous partageaient le même : le trafic général consommait le quota du login).
 * Note : en mémoire = remis à zéro au redémarrage et non partagé entre instances ;
 * en production multi-instances, passer sur Redis.
 */
const allLimiters: RateLimiter[] = [];

/** Remet tous les compteurs à zéro (tests). */
export function resetAllRateLimits() {
  for (const limiter of allLimiters) limiter.reset();
}

/**
 * Clé = l'email visé, quelle que soit l'IP (VULN-007, VULN-008).
 * La même clé est utilisée que le compte existe ou non : pas de fuite d'information.
 */
const byTargetEmail = (scope: string) => (req: Request) =>
  `${scope}:${String(req.body?.email ?? '').trim().toLowerCase()}`;

export const rateLimit = (
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000,
  keyFn: (req: Request) => string = (req) => req.ip || req.socket.remoteAddress || 'unknown'
): RateLimiter => {
  const store = new Map<string, Bucket>();

  const limiter = ((req: Request, res: Response, next: NextFunction) => {
    const identifier = keyFn(req);
    const now = Date.now();
    let bucket = store.get(identifier);

    if (!bucket || now > bucket.resetTime) {
      bucket = { count: 0, resetTime: now + windowMs };
      store.set(identifier, bucket);
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - bucket.count - 1));

    if (bucket.count >= maxRequests) {
      const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: 'Too many requests', retryAfter, statusCode: 429 });
    }

    bucket.count++;
    next();
  }) as RateLimiter;

  limiter.reset = () => store.clear();
  allLimiters.push(limiter);

  // Nettoyage périodique ; unref() pour ne pas empêcher le process (ou Jest) de se terminer
  setInterval(() => {
    const now = Date.now();
    for (const [key, b] of store) if (b.resetTime < now) store.delete(key);
  }, Math.max(windowMs, 60_000)).unref();

  return limiter;
};

// Login : 5 tentatives / 15 min (anti brute-force)
export const loginRateLimit = rateLimit(5, 15 * 60 * 1000);

// Autres routes sensibles (invitation, reset mot de passe, bootstrap) : 10 / 15 min
export const sensitiveRateLimit = rateLimit(10, 15 * 60 * 1000);

// Général : 100 requêtes / 15 min
export const generalRateLimit = rateLimit(100, 15 * 60 * 1000);

// VULN-007 : 5 essais / 15 min sur un même compte, toutes IP confondues (brute force distribuée)
export const loginAccountRateLimit = rateLimit(5, 15 * 60 * 1000, byTargetEmail('login'));

// VULN-008 : 3 demandes de reset / heure pour un même email, toutes IP confondues (bombardement d'emails)
export const passwordResetAccountRateLimit = rateLimit(3, 60 * 60 * 1000, byTargetEmail('reset'));

// Création de ticket (déclenche un appel IA payant) : 10 / heure / utilisateur connecté
export const ticketCreateRateLimit = rateLimit(10, 60 * 60 * 1000, (req) => `user:${req.userId ?? req.ip}`);
