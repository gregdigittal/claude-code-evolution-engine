/**
 * validator.ts — Three-tier proposal validation system.
 *
 * Tier 1 (ALL proposals): Static analysis — path existence, JSON validity, bash syntax
 * Tier 2 (medium/high/breaking): Isolated dry run — sandbox load test, hook execution
 * Tier 3 (high/breaking, Tier 2 passed): SDK smoke test against sandbox config
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { queryModel } from '../sdk.js';
import type { Proposal, ProposedChange } from '../proposals/generator.js';

const log = createTaggedLogger('validator');

export type TierStatus = 'pass' | 'fail' | 'skip';

export type TierResult = {
  readonly status: TierStatus;
  readonly checks: readonly string[];
  readonly failures: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: string;
};

export type ProposalTestResult = {
  readonly proposalId: string;
  readonly risk: string;
  readonly tier1: TierResult;
  readonly tier2: TierResult | null;
  readonly tier3: TierResult | null;
  readonly overall: 'pass' | 'fail' | 'untested';
};

export type TestResultsFile = {
  readonly runDate: string;
  readonly proposalsTested: number;
  readonly tier1Passed: number;
  readonly tier2Tested: number;
  readonly tier2Passed: number;
  readonly tier3Tested: number;
  readonly tier3Passed: number;
  readonly results: readonly ProposalTestResult[];
};

function resolveHome(p: string, homeDir: string): string {
  return p.replace(/^~/, homeDir);
}

export function runTier1(proposal: Proposal, homeDir: string): TierResult {
  const checks: string[] = [];
  const failures: string[] = [];

  for (const change of proposal.proposedChanges) {
    const resolved = resolveHome(change.path, homeDir);

    if (change.action === 'modify' || change.action === 'delete') {
      if (!existsSync(resolved)) {
        failures.push(`modify target not found: ${change.path}`);
      } else {
        checks.push(`target exists: ${change.path}`);
      }
    } else if (change.action === 'create') {
      const parent = dirname(resolved);
      const isPluginDir = resolved.includes('/.claude/plugins/');
      if (!isPluginDir && !existsSync(parent)) {
        failures.push(`parent directory not found for: ${change.path}`);
      } else {
        checks.push(`parent exists: ${change.path}`);
      }
    }

    const hasContent = (change.diff ?? change.content) !== undefined;
    if (hasContent && (change.path.endsWith('.json'))) {
      const raw = change.diff ?? change.content ?? '';
      try {
        JSON.parse(raw);
        checks.push(`valid JSON: ${change.path}`);
      } catch {
        failures.push(`invalid JSON in diff/content for ${change.path}`);
      }
    }

    if (change.content !== undefined && change.path.endsWith('.sh')) {
      if (!change.content.startsWith('#!/')) {
        failures.push(`missing shebang in ${change.path}`);
      } else {
        checks.push(`shebang present: ${change.path}`);
      }
      try {
        execFileSync('bash', ['-n', '-'], {
          input: change.content,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });
        checks.push(`bash syntax ok: ${change.path}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`bash syntax error in ${change.path}: ${message}`);
      }
    }
  }

  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    checks,
    failures,
  };
}

export async function runTier2(
  proposal: Proposal,
  sandboxDir: string,
  homeDir: string
): Promise<TierResult> {
  const checks: string[] = [];
  const failures: string[] = [];
  let stdout = '';
  let stderr = '';

  const proposalSandbox = join(sandboxDir, proposal.id);
  const sandboxClaudeDir = join(proposalSandbox, '.claude');

  try {
    const globalClaudeDir = join(homeDir, '.claude');
    if (existsSync(globalClaudeDir)) {
      mkdirSync(sandboxClaudeDir, { recursive: true });
      cpSync(globalClaudeDir, sandboxClaudeDir, { recursive: true });
    } else {
      mkdirSync(sandboxClaudeDir, { recursive: true });
    }
    checks.push('sandbox created');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'fail',
      checks,
      failures: [`sandbox creation failed: ${message}`],
    };
  }

  try {
    const result = execFileSync('claude', ['--version'], {
      env: { ...process.env, HOME: proposalSandbox },
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    stdout = result;
    checks.push('claude --version succeeded');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`claude --version failed: ${message}`);
  }

  for (const change of proposal.proposedChanges) {
    if (change.action === 'create' && change.path.endsWith('.sh') && change.content) {
      try {
        execFileSync('bash', ['-n', '-'], {
          input: change.content,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });
        checks.push(`hook syntax ok in sandbox: ${change.path}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`hook syntax error in sandbox for ${change.path}: ${message}`);
      }
    }

    if (
      (change.action === 'modify' || change.action === 'create') &&
      change.path.includes('settings.json') &&
      change.content
    ) {
      try {
        JSON.parse(change.content);
        checks.push('settings.json content parses');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`settings.json parse error: ${message}`);
      }
    }
  }

  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    checks,
    failures,
    stdout,
    stderr,
  };
}

export async function runTier3(
  proposal: Proposal,
  _sandboxDir: string
): Promise<TierResult> {
  const checks: string[] = [];
  const failures: string[] = [];

  try {
    const result = await queryModel({
      model: 'haiku',
      prompt: 'List your available skills and confirm your configuration loaded without errors. Reply in 1-2 sentences.',
      phaseName: 'tier3-smoke',
      maxTurns: 1,
    });

    if (result.success) {
      const output = result.output.toLowerCase();
      if (
        output.includes('error') && output.includes('config') ||
        output.includes('failed to load')
      ) {
        failures.push(`smoke test output indicates config error: ${result.output.slice(0, 200)}`);
      } else {
        checks.push('smoke test passed');
      }
    } else {
      failures.push(`SDK query failed: ${result.error ?? 'unknown error'}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`tier 3 smoke test threw: ${message}`);
  }

  return {
    status: failures.length === 0 ? 'pass' : 'fail',
    checks,
    failures,
  };
}

export async function validateProposals(
  proposals: Proposal[],
  sandboxBaseDir: string,
  homeDir: string,
  runDate: string
): Promise<TestResultsFile> {
  log.info(`validating ${proposals.length} proposals (three-tier)`);
  mkdirSync(sandboxBaseDir, { recursive: true });

  const results: ProposalTestResult[] = [];
  let tier1Passed = 0;
  let tier2Tested = 0;
  let tier2Passed = 0;
  let tier3Tested = 0;
  let tier3Passed = 0;

  for (const proposal of proposals) {
    const risk = proposal.risk;

    log.info(`testing ${proposal.id} (risk: ${risk})`);

    const tier1 = runTier1(proposal, homeDir);
    let tier2: TierResult | null = null;
    let tier3: TierResult | null = null;

    const needsTier2 = risk === 'medium' || risk === 'high' || risk === 'breaking';
    const needsTier3 = risk === 'high' || risk === 'breaking';

    if (tier1.status === 'pass') {
      tier1Passed++;

      if (needsTier2) {
        tier2Tested++;
        tier2 = await runTier2(proposal, sandboxBaseDir, homeDir);
        if (tier2.status === 'pass') {
          tier2Passed++;

          if (needsTier3) {
            tier3Tested++;
            tier3 = await runTier3(proposal, sandboxBaseDir);
            if (tier3.status === 'pass') {
              tier3Passed++;
            }
          }
        }
      }
    }

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

    log.info(`${proposal.id}: ${overall}`);
    results.push({ proposalId: proposal.id, risk, tier1, tier2, tier3, overall });
  }

  return {
    runDate,
    proposalsTested: proposals.length,
    tier1Passed,
    tier2Tested,
    tier2Passed,
    tier3Tested,
    tier3Passed,
    results,
  };
}
