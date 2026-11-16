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

// En-têtes de sécurité de base
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(generalRateLimit);

// Swagger documentation
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

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
