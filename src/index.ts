/**
 * index.ts — CCEE entry point.
 *
 * Orchestrates all 6 phases of the Evolution Engine pipeline.
 *
 * Usage:
 *   npm run dev           — Start review UI server only
 *   npm run ccee:run      — Run full pipeline (all 6 phases)
 *   node dist/index.js    — Production (server mode)
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import cron from 'node-cron';
import { buildConfig, validateConfig } from './config.js';
import { setLogFile, createTaggedLogger } from './utils/logger.js';
import { startServer } from './server/app.js';
import { runResearchPhase } from './phases/01-research.js';
import { runAuditPhase } from './phases/02-audit.js';
import { runProposalPhase } from './phases/03-propose.js';
import { runTestPhase } from './phases/04-test.js';
import { runReviewUiPhase } from './phases/05-review-ui.js';
import { runApplyPhase } from './phases/06-apply-and-document.js';

const log = createTaggedLogger('ccee');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getRunDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getWeekLabel(date: string): string {
  const d = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getLastRunDate(runDir: string): Date {
  try {
    const latestPath = join(runDir, 'latest.json');
    if (existsSync(latestPath)) {
      const data = JSON.parse(readFileSync(latestPath, 'utf-8')) as { runDate?: string };
      if (data.runDate) {
        return new Date(data.runDate);
      }
    }
  } catch {
    // Fall through
  }
  // Default: 7 days ago
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Full pipeline run
// ---------------------------------------------------------------------------
async function runPipeline(): Promise<void> {
  const config = buildConfig();
  const runDate = getRunDate();
  const weekLabel = getWeekLabel(runDate);
  const lastRunDate = getLastRunDate(config.runDir);

  // Set up logging for this run
  mkdirSync(join(config.runDir, runDate), { recursive: true });
  setLogFile(join(config.runDir, runDate, 'pipeline.log'));

  log.info(`=== CCEE PIPELINE START: ${runDate} (${weekLabel}) ===`);
  log.info(`last run: ${lastRunDate.toISOString().slice(0, 10)}`);

  try {
    // Phase 1: Research
    const intelligence = await runResearchPhase(config, runDate, lastRunDate);

    // Phase 2: Audit
    const audit = await runAuditPhase(config, runDate, intelligence);

    // Phase 3: Propose
    const proposalResult = await runProposalPhase(config, runDate, intelligence, audit);

    // Phase 4: Test
    const testResult = await runTestPhase(config, runDate, audit, proposalResult);

    // Phase 5: Review UI (notifies operator, starts server)
    await runReviewUiPhase(config, runDate, proposalResult, testResult);

    log.info(`=== CCEE PIPELINE COMPLETE: Awaiting operator review at port ${config.reviewUiPort} ===`);
    log.info(`Review URL: http://${config.tailscaleIp}:${config.reviewUiPort}/ccee/review/${runDate}`);

    // Phase 6 is triggered separately after operator reviews
    // It can also be triggered via POST /api/ccee/runs/:date/apply
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`pipeline failed: ${message}`);
    if (err instanceof Error && err.stack) {
      log.error(err.stack);
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isRunMode = args.includes('--run');
  const isApplyMode = args.includes('--apply');
  const isRollbackMode = args.includes('--rollback');

  // Validate config — fail fast on missing vars
  try {
    validateConfig();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  const config = buildConfig();

  // Ensure runtime dirs exist
  for (const dir of [config.runDir, config.backupDir, config.cacheDir, config.testEnvDir]) {
    mkdirSync(dir, { recursive: true });
  }

  if (isRunMode) {
    // One-off full pipeline run
    await runPipeline();
    return;
  }

  if (isApplyMode) {
    // Apply accepted proposals for a specific run date
    const dateArg = args[args.indexOf('--apply') + 1];
    if (!dateArg) {
      console.error('Usage: --apply <run-date>');
      process.exit(1);
    }
    log.info(`apply mode for run ${dateArg}`);
    // TODO: Load audit + proposal results from run dir and call runApplyPhase
    log.warn('--apply mode not yet fully implemented — use the Review UI');
    return;
  }

  if (isRollbackMode) {
    const dateArg = args[args.indexOf('--rollback') + 1];
    if (!dateArg) {
      console.error('Usage: --rollback <run-date>');
      process.exit(1);
    }
    const { rollbackRun } = await import('./apply/rollback.js');
    log.info(`rolling back run ${dateArg}`);
    rollbackRun(config.backupDir, dateArg);
    return;
  }

  // Default: server mode — start the review UI server
  log.info(`Starting CCEE Review UI server on port ${config.reviewUiPort}`);
  startServer(config.runDir, config.reviewUiPort, config.tailscaleIp);

  // Weekly cron: Sunday 00:00 UTC = 02:00 SAST
  // Note: docs say 02:00 SAST which is 00:00 UTC (UTC+2, no DST)
  cron.schedule('0 0 * * 0', async () => {
    log.info('cron triggered: weekly CCEE run');
    await runPipeline();
  });

  log.info('CCEE server running. Weekly pipeline scheduled for Sunday 00:00 UTC (02:00 SAST).');
}

main().catch((err: unknown) => {
  console.error('[CCEE] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
