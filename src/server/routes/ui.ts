/**
 * ui.ts — Review UI routes (serves the single-page app).
 *
 * GET /ccee/review/:date  → Review UI for a specific run
 * GET /                   → Redirect to latest run
 */

import { Router, Request, Response } from 'express';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTaggedLogger } from '../../utils/logger.js';

const log = createTaggedLogger('ui-routes');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = resolve(__dirname, '..', 'public');

export function createUiRouter(runDir: string): Router {
  const router = Router();

  // Root redirect → latest run
  router.get('/', (_req: Request, res: Response) => {
    try {
      if (!existsSync(runDir)) {
        res.sendFile(join(PUBLIC_DIR, 'index.html'));
        return;
      }
      const runs = readdirSync(runDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();

      if (runs.length === 0) {
        res.sendFile(join(PUBLIC_DIR, 'index.html'));
        return;
      }

      res.redirect(`/ccee/review/${runs[0]}`);
    } catch (err: unknown) {
      log.error(`root redirect failed: ${err instanceof Error ? err.message : String(err)}`);
      res.sendFile(join(PUBLIC_DIR, 'index.html'));
    }
  });

  // Review UI for a specific run
  router.get('/ccee/review/:date', (_req: Request, res: Response) => {
    res.sendFile(join(PUBLIC_DIR, 'index.html'));
  });

  return router;
}
