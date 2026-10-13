import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import * as db from './db.js';
import * as jobs from './jobs.js';
import { loadConfig } from './config.js';
import { createRoutes } from './routes.js';
import { searchOneWay } from './search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({
  config = loadConfig(),
  database = db,
  jobRunner = jobs,
  searchFlights = searchOneWay,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));
  app.use((error, _request, response, next) => {
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Invalid JSON body.' });
      return;
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: 'JSON body is too large.' });
      return;
    }
    next(error);
  });

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      version: config.commitSha,
      capabilities: {
        search: config.duffelConfigured,
        subscriptions: config.subscriptionsEnabled,
      },
    });
  });

  app.use('/api', createRoutes({ config, database, jobRunner, searchFlights }));
  app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found.' }));

  const distDir = path.resolve(__dirname, '../dist');
  app.use(
    express.static(distDir, {
      setHeaders(response, filePath) {
        const hashedAsset = /[\\/]assets[\\/].+-[A-Za-z0-9_-]{8,}\./.test(filePath);
        response.set(
          'Cache-Control',
          hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
  app.get('/{*splat}', (_request, response) => {
    response.set('Cache-Control', 'no-cache');
    response.sendFile(path.join(distDir, 'index.html'));
  });

  app.use((error, _request, response, _next) => {
    void _next;
    console.error('[server] unhandled error:', error);
    response.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
