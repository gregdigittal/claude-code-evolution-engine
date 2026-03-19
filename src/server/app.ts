/**
 * app.ts — CCEE Review UI Express server.
 *
 * Serves the Mission Control-styled review UI at localhost:9898
 * and via Tailscale at http://{VPS_TAILSCALE_IP}:9898
 *
 * Routes:
 *   GET  /ccee/review/:date             → Review UI (SPA)
 *   GET  /api/ccee/latest               → Latest run summary
 *   GET  /api/ccee/runs                 → All runs
 *   GET  /api/ccee/runs/:date           → Full run details
 *   GET  /api/ccee/runs/:date/proposals → All proposals
 *   POST /api/ccee/runs/:date/apply     → Apply selected proposals
 *   POST /api/ccee/runs/:date/reject    → Reject proposals
 *   GET  /api/ccee/health               → Health check
 *   GET  /api/ccee/config               → Config summary
 *   POST /api/ccee/trigger              → Trigger on-demand run
 */

import express from 'express';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTaggedLogger } from '../utils/logger.js';
import { createApiRouter } from './routes/api.js';
import { createUiRouter } from './routes/ui.js';

const log = createTaggedLogger('server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = resolve(__dirname, 'public');

export function createApp(runDir: string): express.Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Serve static files (the SPA)
  app.use(express.static(PUBLIC_DIR));

  // API routes
  app.use('/api/ccee', createApiRouter(runDir));

  // UI routes (catch-all for SPA navigation)
  app.use('/', createUiRouter(runDir));

  return app;
}

/**
 * Start the Express server.
 */
export function startServer(
  runDir: string,
  port: number,
  tailscaleIp: string
): void {
  const app = createApp(runDir);

  app.listen(port, '0.0.0.0', () => {
    log.info(`CCEE Review UI listening on:`);
    log.info(`  Local:     http://localhost:${port}`);
    log.info(`  Tailscale: http://${tailscaleIp}:${port}`);
    log.info(`  Review:    http://${tailscaleIp}:${port}/ccee/review/latest`);
  });
}

// Allow running as: node dist/server/app.js
const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const port = parseInt(process.env.REVIEW_UI_PORT ?? '9898', 10);
  const tailscaleIp = process.env.VPS_TAILSCALE_IP ?? '100.88.238.20';
  const runDir =
    process.env.CCEE_RUN_DIR ?? '/home/gregmorris/.ccee/runs';
  startServer(runDir, port, tailscaleIp);
}
