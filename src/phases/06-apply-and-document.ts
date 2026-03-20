/**
 * Phase 6 — Apply & Document
 *
 * After operator review: creates backup, applies accepted proposals,
 * generates Obsidian documentation, and pushes to Git.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { createBackup } from '../apply/backup.js';
import { applyAll } from '../apply/applier.js';
import { captureSnapshot } from '../audit/config-snapshot.js';
import { generateArchitectureDiagram, generateBeforeAfterDiagram } from '../obsidian/svg-generator.js';
import { writeWeeklyDocumentation } from '../obsidian/writer.js';
import { assembleReadme } from '../obsidian/readme-assembler.js';
import { commitAll, pushToRemote } from '../utils/git.js';
import { sendNotification } from '../utils/notifications.js';
import type { Config } from '../config.js';
import type { AuditResult } from './02-audit.js';
import type { ProposalResult } from './03-propose.js';
import type { TestResult } from './04-test.js';

const log = createTaggedLogger('phase-6-apply-document');

export async function runApplyPhase(
  config: Config,
  runDate: string,
  weekLabel: string,
  audit: AuditResult,
  proposalResult: ProposalResult,
  testResult: TestResult
): Promise<void> {
  log.info('=== PHASE 6: APPLY & DOCUMENT ===');

  const runDir = join(config.runDir, runDate);

  // Read operator decisions
  const acceptedPath = join(runDir, 'accepted.json');
  if (!existsSync(acceptedPath)) {
    log.warn('no accepted.json found — skipping apply (operator has not reviewed yet)');
    return;
  }

  const accepted = JSON.parse(readFileSync(acceptedPath, 'utf-8')) as {
    proposalIds: string[];
  };
  const acceptedSet = new Set(accepted.proposalIds);

  const toApply = testResult.passedProposals.filter((p) =>
    acceptedSet.has(p.id)
  );

  log.info(`applying ${toApply.length} accepted proposals`);

  // 6A. Backup
  log.info('creating backup before apply');
  const backup = createBackup(config.backupDir, runDate);

  // 6B. Apply
  const applyResults = await applyAll(toApply, config.backupDir, runDate);
  const succeeded = applyResults.filter((r) => r.success).length;
  log.info(`applied: ${succeeded}/${toApply.length} proposals`);

  // Capture post-apply snapshot
  const snapshotAfter = captureSnapshot(join(runDir, 'post-apply'));

  // 6C. Generate SVG diagrams
  log.info('generating SVG architecture diagrams (Opus)');
  const [currentSetupSvg, beforeAfterSvg] = await Promise.allSettled([
    generateArchitectureDiagram(
      snapshotAfter,
      join(config.obsidianStagingPath, 'CCEE', 'Architecture', 'current-setup.svg')
    ),
    generateBeforeAfterDiagram(
      audit.snapshot,
      snapshotAfter,
      join(config.obsidianStagingPath, 'CCEE', 'Weekly-Reviews', weekLabel, 'before-after.svg')
    ),
  ]);

  // 6D. Write Obsidian documentation
  log.info('writing Obsidian documentation');
  await writeWeeklyDocumentation(
    {
      runDate,
      weekLabel,
      sourcesScanned: proposalResult.proposals.length, // approximate
      proposalsGenerated: proposalResult.proposals.length,
      proposalsAccepted: succeeded,
      proposalsRejected: proposalResult.proposals.length - accepted.proposalIds.length,
      testPassRate: testResult.testPassRate,
      proposals: proposalResult.sorted,
      applyResults,
      benchmarks: testResult.benchmarks,
      snapshotAfter,
    },
    config.obsidianStagingPath,
    beforeAfterSvg.status === 'fulfilled' ? (beforeAfterSvg.value ?? undefined) : undefined,
    currentSetupSvg.status === 'fulfilled' ? (currentSetupSvg.value ?? undefined) : undefined
  );

  // Assemble README
  assembleReadme(config.obsidianStagingPath, process.cwd());

  // Commit and push Obsidian staging
  if (config.obsidianVaultGitRemote) {
    log.info('committing and pushing Obsidian documentation');
    commitAll(
      config.obsidianStagingPath,
      `ccee: weekly run ${weekLabel} — ${succeeded} changes applied`
    );
    pushToRemote(config.obsidianStagingPath);
  }

  // Push applied config changes to claude-config git repo
  const claudeConfigDir = join(homedir(), '.claude');
  if (existsSync(join(claudeConfigDir, '.git'))) {
    log.info('pushing applied config changes to claude-config repo');
    try {
      commitAll(claudeConfigDir, `ccee: apply ${weekLabel} — ${succeeded} proposals`);
      pushToRemote(claudeConfigDir);
    } catch (err: unknown) {
      log.warn(`claude-config push failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Notify completion
  await sendNotification(config.slackWebhookUrl, {
    level: 'success',
    title: `CCEE Run Complete — ${weekLabel}`,
    message: `${succeeded} proposals applied. Documentation updated in Obsidian.`,
    runDate,
  });

  log.info('=== PHASE 6 COMPLETE ===');
}
