import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import 'dotenv/config';
import * as db from './db.js';
import routes from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', persistenceEnabled: db.isEnabled() });
});

app.use('/api', routes);

const distDir = path.resolve(__dirname, '../dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Atlantis listening on port ${port}`);
  if (!db.isEnabled()) {
    console.warn('[db] Supabase not configured — subscriptions are disabled.');
  }
});
