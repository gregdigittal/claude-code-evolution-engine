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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTaggedLogger } from '../../utils/logger.js';
import { runTier1, runTier2, runTier3 } from '../../testing/validator.js';
import type { ProposalTestResult, TierResult } from '../../testing/validator.js';
import { healProposal } from '../../testing/healer.js';
import type { HealResult } from '../../testing/healer.js';
import type { Proposal } from '../../proposals/generator.js';

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
      const data = JSON.parse(readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;

      // Merge sidebar intelligence counters from intelligence-report.json
      const intelPath = join(runDir, date, 'intelligence-report.json');
      if (existsSync(intelPath)) {
        const intel = JSON.parse(readFileSync(intelPath, 'utf-8')) as Record<string, unknown>;
        data['sourcesScanned'] = typeof intel['sourcesScanned'] === 'number' ? intel['sourcesScanned'] : null;
        data['reposTracked'] = Array.isArray(intel['frameworkUpdates']) ? intel['frameworkUpdates'].length : null;
        data['videosAnalysed'] = Array.isArray(intel['youtubeIntelligence']) ? intel['youtubeIntelligence'].length : null;
      }

      // Merge test results summary
      const testResultsPath = join(runDir, date, 'test-results.json');
      if (existsSync(testResultsPath)) {
        const tr = JSON.parse(readFileSync(testResultsPath, 'utf-8')) as Record<string, unknown>;
        data['testsPassed'] = tr['tier1Passed'] ?? null;
        data['testsTotal'] = tr['proposalsTested'] ?? null;
      }

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
      const proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Array<Record<string, unknown>>;

      // Merge per-proposal test results if available
      const testResultsPath = join(runDir, date, 'test-results.json');
      if (existsSync(testResultsPath)) {
        const tr = JSON.parse(readFileSync(testResultsPath, 'utf-8')) as Record<string, unknown>;
        const results = Array.isArray(tr['results']) ? tr['results'] : [];
        const testMap = new Map(results.map((r: Record<string, unknown>) => [r['proposalId'], r]));
        for (const proposal of proposals) {
          const id = String(proposal['id'] ?? '');
          const result = testMap.get(id);
          if (result) {
            proposal['testStatus'] = result['overall'];
            proposal['testTier1'] = result['tier1'];
            proposal['testTier2'] = result['tier2'];
            proposal['testTier3'] = result['tier3'];
            proposal['testRisk'] = result['risk'];
          } else {
            proposal['testStatus'] = 'untested';
          }
        }
      } else {
        for (const proposal of proposals) {
          proposal['testStatus'] = 'untested';
        }
      }

      res.json({ proposals });
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

      // Persist applied status to proposals.json so state survives page refresh
      const proposalsPath = join(runDir, date, 'proposals.json');
      let proposals: Array<Record<string, unknown>> = [];
      if (existsSync(proposalsPath)) {
        proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Array<Record<string, unknown>>;
        const appliedAt = new Date().toISOString();
        const idSet = new Set(proposalIds);
        proposals = proposals.map((p) =>
          idSet.has(String(p['id'])) ? { ...p, status: 'applied', appliedAt } : p
        );
        writeFileSync(proposalsPath, JSON.stringify(proposals, null, 2), 'utf-8');
      }

      // Write accepted list for the apply phase to pick up
      const acceptedPath = join(runDir, date, 'accepted.json');
      writeFileSync(acceptedPath, JSON.stringify({ proposalIds }), 'utf-8');
      log.info(`apply requested: ${proposalIds.length} proposals for ${date}`);

      res.json({ status: 'queued', proposalIds, proposals });
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

      // Persist rejected status to proposals.json so state survives page refresh
      const proposalsPath = join(runDir, date, 'proposals.json');
      let proposals: Array<Record<string, unknown>> = [];
      if (existsSync(proposalsPath)) {
        proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Array<Record<string, unknown>>;
        const rejectedAt = new Date().toISOString();
        const idSet = new Set(proposalIds);
        proposals = proposals.map((p) =>
          idSet.has(String(p['id'])) ? { ...p, status: 'rejected', rejectedAt } : p
        );
        writeFileSync(proposalsPath, JSON.stringify(proposals, null, 2), 'utf-8');
      }

      const rejectedPath = join(runDir, date, 'rejected.json');
      writeFileSync(rejectedPath, JSON.stringify({ proposalIds }), 'utf-8');
      log.info(`reject recorded: ${proposalIds.length} proposals for ${date}`);

      res.json({ status: 'recorded', proposalIds, proposals });
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

  // POST /api/ccee/runs/:date/proposals/:id/test
  router.post('/runs/:date/proposals/:id/test', (req: Request, res: Response) => {
    try {
      const date = String(req.params['date'] ?? '');
      const proposalId = String(req.params['id'] ?? '');

      const proposalsPath = join(runDir, date, 'proposals.json');
      if (!existsSync(proposalsPath)) {
        res.status(404).json({ error: 'Proposals not found for this run' });
        return;
      }

      const proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Proposal[];
      const proposal = proposals.find((p) => p.id === proposalId);
      if (!proposal) {
        res.status(404).json({ error: `Proposal ${proposalId} not found` });
        return;
      }

      const jobId = randomUUID();
      const jobsDir = join(runDir, date, 'jobs');
      mkdirSync(jobsDir, { recursive: true });
      const jobFilePath = join(jobsDir, `${jobId}.json`);

      const initialJob = {
        jobId,
        proposalId,
        status: 'running',
        testResult: null,
        healResult: null,
        startedAt: new Date().toISOString(),
      };
      writeFileSync(jobFilePath, JSON.stringify(initialJob, null, 2), 'utf-8');

      // Fire-and-forget
      runSingleProposalTest(date, proposalId, jobId, jobFilePath, runDir).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error(`runSingleProposalTest unhandled error for job ${jobId}: ${message}`);
      });

      res.json({ jobId, proposalId, status: 'running' });
    } catch (err: unknown) {
      log.error(
        `/proposals/:id/test failed: ${err instanceof Error ? err.message : String(err)}`
      );
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/ccee/runs/:date/jobs/:jobId
  router.get('/runs/:date/jobs/:jobId', (req: Request, res: Response) => {
    const date = String(req.params['date'] ?? '');
    const jobId = String(req.params['jobId'] ?? '');
    const jobFilePath = join(runDir, date, 'jobs', `${jobId}.json`);
    if (!existsSync(jobFilePath)) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    const data = JSON.parse(readFileSync(jobFilePath, 'utf-8'));
    res.json(data);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Fire-and-forget test runner — called from POST /runs/:date/proposals/:id/test
// ---------------------------------------------------------------------------

async function runSingleProposalTest(
  date: string,
  proposalId: string,
  jobId: string,
  jobFilePath: string,
  runDir: string
): Promise<void> {
  const homeDir = process.env['HOME'] ?? '/root';
  const dateRunDir = join(runDir, date);
  const sandboxBaseDir = join(dateRunDir, 'sandbox');

  try {
    const proposalsPath = join(dateRunDir, 'proposals.json');
    const proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Proposal[];
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const risk = proposal.risk;
    const needsTier2 = risk === 'medium' || risk === 'high' || risk === 'breaking';
    const needsTier3 = risk === 'high' || risk === 'breaking';

    // Tier 1 — always run
    const tier1: TierResult = runTier1(proposal, homeDir);

    let tier2: TierResult | null = null;
    let tier3: TierResult | null = null;

    if (tier1.status === 'pass' && needsTier2) {
      mkdirSync(sandboxBaseDir, { recursive: true });
      tier2 = await runTier2(proposal, sandboxBaseDir, homeDir);

      if (tier2.status === 'pass' && needsTier3) {
        tier3 = await runTier3(proposal, sandboxBaseDir);
      }
    }

    // Determine overall
    let overall: 'pass' | 'fail' | 'untested';
    if (tier1.status === 'fail') {
      overall = 'fail';
    } else if (needsTier2 && tier2?.status === 'fail') {
      overall = 'fail';
    } else if (needsTier3 && tier3?.status === 'fail') {
      overall = 'fail';
    } else if (tier1.status === 'pass') {
      overall = 'pass';
    } else {
      overall = 'untested';
    }

    const testResult: ProposalTestResult = {
      proposalId,
      risk,
      tier1,
      tier2,
      tier3,
      overall,
    };

    // Update the proposal's testStatus in proposals.json
    const updatedProposals = proposals.map((p) => {
      if (p.id === proposalId) {
        return { ...p, testStatus: overall } as unknown as Proposal;
      }
      return p;
    });
    writeFileSync(proposalsPath, JSON.stringify(updatedProposals, null, 2), 'utf-8');

    // Run healer if overall failed
    let healResult: HealResult | null = null;
    if (overall === 'fail') {
      healResult = await healProposal(proposal, testResult, homeDir, dateRunDir);
    }

    // Write final job file
    const finalJob = {
      jobId,
      proposalId,
      status: 'complete',
      testResult,
      healResult,
      completedAt: new Date().toISOString(),
    };
    writeFileSync(jobFilePath, JSON.stringify(finalJob, null, 2), 'utf-8');

    log.info(`job ${jobId}: complete — proposal ${proposalId} overall=${overall}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`job ${jobId}: error — ${message}`);
    const errorJob = {
      jobId,
      proposalId,
      status: 'error',
      error: message,
    };
    writeFileSync(jobFilePath, JSON.stringify(errorJob, null, 2), 'utf-8');
  }
}
