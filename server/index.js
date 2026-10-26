import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const server = createApp({ config }).listen(config.port, () => {
  console.log(`Atlantis listening on port ${config.port}`);
  if (!config.searchConfigured)
    console.warn('[search] Configure SerpApi and Supabase to enable searches.');
});

function shutdown(signal) {
  console.log(`[server] ${signal} received; closing connections.`);
  server.close((error) => {
    if (error) {
      console.error('[server] graceful shutdown failed:', error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (error) => {
  console.error('[server] unhandled rejection:', error);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception:', error);
  process.exit(1);
});
