/**
 * Phase 4 — Sandboxed Testing
 *
 * Creates an isolated test environment, validates each proposal,
 * and runs comparative benchmarks.
 */

import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { createSandbox } from '../testing/sandbox.js';
import { validateAll } from '../testing/validator.js';
import { measureCurrent, measureSandbox, compareMetrics } from '../testing/benchmarks.js';
import type { Config } from '../config.js';
import type { AuditResult } from './02-audit.js';
import type { ProposalResult } from './03-propose.js';
import type { Proposal } from '../proposals/generator.js';

const log = createTaggedLogger('phase-4-test');

export type TestResult = {
  readonly sandbox: ReturnType<typeof createSandbox>;
  readonly validationResults: Awaited<ReturnType<typeof validateAll>>;
  readonly benchmarks: ReturnType<typeof compareMetrics>;
  readonly passedProposals: readonly Proposal[];
  readonly failedProposals: readonly Proposal[];
  readonly testPassRate: number;
};

export async function runTestPhase(
  config: Config,
  runDate: string,
  audit: AuditResult,
  proposalResult: ProposalResult
): Promise<TestResult> {
  log.info('=== PHASE 4: SANDBOXED TESTING ===');

  // 4A. Create sandbox
  log.info('creating sandbox environment');
  const sandbox = createSandbox(config.testEnvDir, runDate);

  // Current benchmarks
  const beforeMetrics = measureCurrent(audit.snapshot);

  // 4B. Validate each proposal in dependency order
  log.info('validating proposals in sandbox');
  const validationResults = await validateAll(
    [...proposalResult.applyOrder.ordered],
    sandbox
  );

  const passedIds = new Set(
    [...validationResults.values()]
      .filter((r) => r.passed)
      .map((r) => r.proposalId)
  );

  const passedProposals = proposalResult.applyOrder.ordered.filter((p) =>
    passedIds.has(p.id)
  );
  const failedProposals = proposalResult.applyOrder.ordered.filter(
    (p) => !passedIds.has(p.id)
  );

  if (failedProposals.length > 0) {
    log.warn(
      `${failedProposals.length} proposals failed validation: ` +
        failedProposals.map((p) => p.id).join(', ')
    );
  }

  // 4C. Benchmarks
  log.info('running comparative benchmarks');
  const afterMetrics = measureSandbox(sandbox);
  const benchmarks = compareMetrics(beforeMetrics, afterMetrics);

  const testPassRate =
    proposalResult.applyOrder.ordered.length > 0
      ? passedProposals.length / proposalResult.applyOrder.ordered.length
      : 1;

  log.info(
    `=== PHASE 4 COMPLETE === ` +
      `${passedProposals.length}/${proposalResult.applyOrder.ordered.length} proposals validated`
  );

  return {
    sandbox,
    validationResults,
    benchmarks,
    passedProposals,
    failedProposals,
    testPassRate,
  };
}
