import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Valide req[source] avec un schéma Zod.
 * Le résultat parsé (types convertis, valeurs par défaut) est rangé dans res.locals[source],
 * car req.query est en lecture seule sous Express 5.
 * En cas d'erreur, la ZodError part au errorHandler central (réponse 400 uniforme).
 */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(result.error);
    res.locals[source] = result.data;
    next();
  };
}
