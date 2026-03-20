/**
 * Phase 5 — Review UI & API
 *
 * Starts (or ensures) the Express server is running and writes the
 * run summary so the UI can fetch it. Notifies the operator with the review URL.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { startServer } from '../server/app.js';
import { sendNotification } from '../utils/notifications.js';
import type { Config } from '../config.js';
import type { ProposalResult } from './03-propose.js';
import type { TestResult } from './04-test.js';

const log = createTaggedLogger('phase-5-review-ui');

export async function runReviewUiPhase(
  config: Config,
  runDate: string,
  proposalResult: ProposalResult,
  testResult: TestResult
): Promise<void> {
  log.info('=== PHASE 5: REVIEW UI ===');

  const runDir = join(config.runDir, runDate);
  mkdirSync(runDir, { recursive: true });

  // Write summary for the API to serve
  const summary = {
    runDate,
    proposalsTotal: proposalResult.proposals.length,
    proposalsPassed: testResult.testResults.tier1Passed,
    proposalsFailed: testResult.testResults.proposalsTested - testResult.testResults.tier1Passed,
    testPassRate: testResult.testPassRate,
    benchmarks: testResult.benchmarks,
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(runDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8'
  );

  // Write latest pointer
  const latest = { ...summary };
  writeFileSync(
    join(config.runDir, 'latest.json'),
    JSON.stringify(latest, null, 2),
    'utf-8'
  );

  const reviewUrl = `http://${config.tailscaleIp}:${config.reviewUiPort}/ccee/review/${runDate}`;
  log.info(`review UI available at: ${reviewUrl}`);

  // Notify operator
  await sendNotification(config.slackWebhookUrl, {
    level: 'info',
    title: `Weekly Run Ready for Review — ${runDate}`,
    message:
      `${testResult.passedProposals.length} proposal(s) ready for review. ` +
      `Open: ${reviewUrl}`,
    runDate,
    link: reviewUrl,
  });

  // Start the server if not already running (idempotent — catches EADDRINUSE)
  try {
    startServer(config.runDir, config.reviewUiPort, config.tailscaleIp);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('EADDRINUSE')) {
      log.warn(`server start warning: ${message}`);
    }
  }

  log.info('=== PHASE 5 COMPLETE ===');
}
