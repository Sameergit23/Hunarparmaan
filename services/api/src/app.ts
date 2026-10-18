import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { TokenIssuer } from './auth/tokens';
import type { Deps } from './domain/context';
import { authenticate } from './http/auth';
import { errorHandler, notFound } from './http/errors';
import { adminRoutes } from './routes/admin';
import { accountRoutes, authRoutes } from './routes/auth';
import { fieldRoutes } from './routes/field';
import { officeRoutes, publicRoutes } from './routes/office';

export interface AppDeps extends Deps {
  tokens: TokenIssuer;
  logger: Logger;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Caddy in staging
  app.use(helmet());
  app.use(pinoHttp({ logger: deps.logger, autoLogging: deps.config.NODE_ENV !== 'test' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // No sign-in needed.
  app.use(authRoutes(deps, deps.tokens));
  app.use(publicRoutes(deps));

  // Everything below needs a valid token, of the account's current version.
  app.use('/v1', authenticate(deps.tokens, deps));
  app.use(accountRoutes(deps, deps.tokens));
  app.use(adminRoutes(deps));
  app.use(fieldRoutes(deps));
  app.use(officeRoutes(deps));

  app.use((_req, _res, next) => next(notFound('Route')));
  app.use(errorHandler);
  return app;
}
