/**
 * Phase 3 — Change Proposal Generation
 *
 * Generates, prioritises, and conflict-checks all proposals.
 */

import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { generateProposals } from '../proposals/generator.js';
import { sortProposals, groupByPriority } from '../proposals/prioritiser.js';
import { detectConflicts } from '../proposals/conflict-detector.js';
import { resolveDependencies } from '../proposals/dependency-resolver.js';
import type { Config } from '../config.js';
import type { IntelligenceReport } from '../research/intelligence-merger.js';
import type { AuditResult } from './02-audit.js';

const log = createTaggedLogger('phase-3-propose');

export type ProposalResult = {
  readonly proposals: Awaited<ReturnType<typeof generateProposals>>;
  readonly sorted: Awaited<ReturnType<typeof generateProposals>>;
  readonly conflicts: ReturnType<typeof detectConflicts>;
  readonly applyOrder: ReturnType<typeof resolveDependencies>;
};

export async function runProposalPhase(
  config: Config,
  runDate: string,
  intelligence: IntelligenceReport,
  audit: AuditResult
): Promise<ProposalResult> {
  const runDir = join(config.runDir, runDate);
  log.info('=== PHASE 3: CHANGE PROPOSAL GENERATION ===');

  // 3A + 3B. Generate proposals
  log.info('generating proposals from intelligence + audit');
  const proposals = await generateProposals(
    intelligence,
    audit.snapshot,
    audit.legacyAnalysis,
    runDate,
    runDir
  );
  log.info(`generated ${proposals.length} proposals`);

  // 3C. Prioritise
  const sorted = sortProposals(proposals);
  const groups = groupByPriority(sorted);
  log.info(
    `priorities: P0=${groups.P0_critical.length}, P1=${groups.P1_high.length}, ` +
      `P2=${groups.P2_medium.length}, P3=${groups.P3_low.length}`
  );

  // 3D. Conflict detection
  log.info('detecting conflicts');
  const conflicts = detectConflicts(sorted);
  if (conflicts.conflicts.length > 0) {
    log.warn(`${conflicts.conflicts.length} conflicts detected`);
  }
  if (conflicts.recentModifications.length > 0) {
    log.warn(`${conflicts.recentModifications.length} proposals touch recently modified files`);
  }

  // Dependency resolution
  const applyOrder = resolveDependencies(sorted);
  if (applyOrder.cycles.length > 0) {
    log.warn(`dependency cycles: ${applyOrder.cycles.map((c) => c.join(', ')).join('; ')}`);
  }

  log.info('=== PHASE 3 COMPLETE ===');

  return { proposals, sorted, conflicts, applyOrder };
}
