/**
 * Phase 4 — Sandboxed Testing
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';
import { validateProposals } from '../testing/validator.js';
import { measureCurrent, measureSandbox, compareMetrics } from '../testing/benchmarks.js';
import { createSandbox } from '../testing/sandbox.js';
import type { Config } from '../config.js';
import type { AuditResult } from './02-audit.js';
import type { ProposalResult } from './03-propose.js';
import type { TestResultsFile } from '../testing/validator.js';
import type { Proposal } from '../proposals/generator.js';

const log = createTaggedLogger('phase-4-test');

export type TestResult = {
  readonly testResults: TestResultsFile;
  readonly benchmarks: ReturnType<typeof compareMetrics>;
  readonly passedProposals: readonly Proposal[];
  readonly failedProposals: readonly Proposal[];
  readonly testPassRate: number;
  readonly validationResults: Map<string, { proposalId: string; passed: boolean; error?: string; validationOutput: string }>;
};

export async function runTestPhase(
  config: Config,
  runDate: string,
  audit: AuditResult,
  proposalResult: ProposalResult
): Promise<TestResult> {
  log.info('=== PHASE 4: SANDBOXED TESTING ===');

  const sandboxBaseDir = join(config.testEnvDir, runDate, 'sandbox');
  mkdirSync(sandboxBaseDir, { recursive: true });

  const sandbox = createSandbox(config.testEnvDir, runDate);
  const beforeMetrics = measureCurrent(audit.snapshot);
  const afterMetrics = measureSandbox(sandbox);
  const benchmarks = compareMetrics(beforeMetrics, afterMetrics);

  const proposals = [...proposalResult.proposals];
  const testResults = await validateProposals(
    proposals,
    sandboxBaseDir,
    homedir(),
    runDate
  );

  const runDir = join(config.runDir, runDate);
  writeFileSync(
    join(runDir, 'test-results.json'),
    JSON.stringify(testResults, null, 2),
    'utf-8'
  );

  const passedIds = new Set(
    testResults.results.filter((r) => r.overall === 'pass').map((r) => r.proposalId)
  );
  const passedProposals = proposals.filter((p) => passedIds.has(p.id));
  const failedProposals = proposals.filter((p) => !passedIds.has(p.id));
  const testPassRate = proposals.length > 0 ? passedProposals.length / proposals.length : 1;

  const validationResults = new Map(
    testResults.results.map((r) => [
      r.proposalId,
      {
        proposalId: r.proposalId,
        passed: r.overall === 'pass',
        error: r.tier1.failures[0] ?? r.tier2?.failures[0] ?? r.tier3?.failures[0],
        validationOutput: [
          ...r.tier1.checks,
          ...(r.tier2?.checks ?? []),
          ...(r.tier3?.checks ?? []),
        ].join(', '),
      },
    ])
  );

  log.info(
    `=== PHASE 4 COMPLETE === ` +
    `${passedProposals.length}/${proposals.length} proposals passed all required tiers`
  );

  return {
    testResults,
    benchmarks,
    passedProposals,
    failedProposals,
    testPassRate,
    validationResults,
  };
}
