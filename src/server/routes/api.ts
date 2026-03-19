/**
 * api.ts — CCEE REST API routes.
 *
 * GET  /api/ccee/latest                → Latest run summary
 * GET  /api/ccee/runs                  → All runs
 * GET  /api/ccee/runs/:date            → Full run details
 * GET  /api/ccee/runs/:date/proposals  → All proposals for a run
 * POST /api/ccee/runs/:date/apply      → Apply selected proposals
 * POST /api/ccee/runs/:date/reject     → Reject proposals
 * GET  /api/ccee/health                → Health check
 * GET  /api/ccee/config                → Current tracked config summary
 * POST /api/ccee/trigger               → Trigger an on-demand run
 */

import { Router, Request, Response } from 'express';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../../utils/logger.js';

const log = createTaggedLogger('api');

export function createApiRouter(runDir: string): Router {
  const router = Router();

  // GET /api/ccee/health
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/ccee/latest
  router.get('/latest', (_req: Request, res: Response) => {
    try {
      const latestPath = join(runDir, 'latest.json');
      if (!existsSync(latestPath)) {
        res.status(404).json({ error: 'No runs found' });
        return;
      }
      const data = JSON.parse(readFileSync(latestPath, 'utf-8'));
      res.json(data);
    } catch (err: unknown) {
      log.error(`/latest failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/ccee/runs
  router.get('/runs', (_req: Request, res: Response) => {
    try {
      if (!existsSync(runDir)) {
        res.json({ runs: [] });
        return;
      }
      const runs = readdirSync(runDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
        .reverse();
      res.json({ runs });
    } catch (err: unknown) {
      log.error(`/runs failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/ccee/runs/:date
  router.get('/runs/:date', (req: Request, res: Response) => {
    try {
      const date = String(req.params['date'] ?? '');
      const summaryPath = join(runDir, date, 'summary.json');
      if (!existsSync(summaryPath)) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      const data = JSON.parse(readFileSync(summaryPath, 'utf-8'));
      res.json(data);
    } catch (err: unknown) {
      log.error(`/runs/:date failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/ccee/runs/:date/proposals
  router.get('/runs/:date/proposals', (req: Request, res: Response) => {
    try {
      const date = String(req.params['date'] ?? '');
      const proposalsPath = join(runDir, date, 'proposals.json');
      if (!existsSync(proposalsPath)) {
        res.status(404).json({ error: 'Proposals not found' });
        return;
      }
      const data = JSON.parse(readFileSync(proposalsPath, 'utf-8'));
      res.json({ proposals: data });
    } catch (err: unknown) {
      log.error(`/runs/:date/proposals failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/ccee/runs/:date/apply
  router.post('/runs/:date/apply', (req: Request, res: Response) => {
    try {
      const date = String(req.params['date'] ?? '');
      const { proposalIds } = req.body as { proposalIds?: string[] };
      if (!Array.isArray(proposalIds) || proposalIds.length === 0) {
        res.status(400).json({ error: 'proposalIds array required' });
        return;
      }

      // Write accepted list to run dir — the apply phase picks it up
      const acceptedPath = join(runDir, date, 'accepted.json');
      writeFileSync(acceptedPath, JSON.stringify({ proposalIds }), 'utf-8');
      log.info(`apply requested: ${proposalIds.length} proposals for ${date}`);

      res.json({ status: 'queued', proposalIds });
    } catch (err: unknown) {
      log.error(`/apply failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/ccee/runs/:date/reject
  router.post('/runs/:date/reject', (req: Request, res: Response) => {
    try {
      const date = String(req.params['date'] ?? '');
      const { proposalIds } = req.body as { proposalIds?: string[] };
      if (!Array.isArray(proposalIds)) {
        res.status(400).json({ error: 'proposalIds array required' });
        return;
      }

      const rejectedPath = join(runDir, date, 'rejected.json');
      writeFileSync(rejectedPath, JSON.stringify({ proposalIds }), 'utf-8');
      log.info(`reject recorded: ${proposalIds.length} proposals for ${date}`);

      res.json({ status: 'recorded', proposalIds });
    } catch (err: unknown) {
      log.error(`/reject failed: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/ccee/config
  router.get('/config', (_req: Request, res: Response) => {
    res.json({
      runDir,
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  });

  // POST /api/ccee/trigger
  router.post('/trigger', (req: Request, res: Response) => {
    log.info('on-demand run triggered via API');
    // TODO: Spawn the pipeline process — implementation in Phase 5 full build
    res.json({ status: 'triggered', message: 'Pipeline run queued' });
  });

  return router;
}
