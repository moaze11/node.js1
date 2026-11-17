import express from 'express';
import swaggerUi from 'swagger-ui-express';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { generalRateLimit } from './middlewares/rateLimit';
import { swaggerSpec } from './swagger';

// L'app est séparée du listen() pour pouvoir être importée dans les tests
const app = express();

// Ne pas annoncer la techno du serveur
app.disable('x-powered-by');

// VULN-010 : documentation interactive fermée en production, sauf ouverture explicite
const apiDocsEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_API_DOCS === 'true';

// En-têtes de sécurité
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // VULN-010 : HTTPS imposé au navigateur pendant 1 an (ignoré tant que l'API est servie en HTTP)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // VULN-010 : l'API ne renvoie que du JSON, rien à exécuter. Swagger UI (scripts, styles) est exclu.
  if (!req.path.startsWith('/api-docs')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  }
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(generalRateLimit);

// Swagger documentation
if (apiDocsEnabled) {
  app.use('/api-docs', swaggerUi.serve);
  app.get('/api-docs', swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
}

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Routes
app.use(routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path, statusCode: 404 });
});

// Error handler (must be last)
app.use(errorHandler);

export default app;
