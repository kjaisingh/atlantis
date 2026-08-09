import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import 'dotenv/config';
import * as db from './db.js';
import routes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
      },
    },
  }),
);
app.use(express.json());
app.use((err, _req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  next(err);
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', persistenceEnabled: db.isEnabled() });
});

app.use('/api', routes);

const distDir = path.resolve(__dirname, '../dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

process.on('unhandledRejection', (err) => {
  console.error('[server] unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Atlantis listening on port ${port}`);
  if (!db.isEnabled()) {
    console.warn('[db] Supabase not configured — subscriptions are disabled.');
  }
});
