/**
 * validator.ts — Validate proposals against the sandbox environment.
 *
 * Runs each proposal's validation command and smoke test in the sandbox.
 * Records pass/fail results to exclude failed proposals from the review UI.
 */

import { execFileSync } from 'node:child_process';
import { createTaggedLogger } from '../utils/logger.js';
import type { Proposal } from '../proposals/generator.js';
import type { SandboxPaths } from './sandbox.js';

const log = createTaggedLogger('validator');

export type ValidationResult = {
  readonly proposalId: string;
  readonly passed: boolean;
  readonly validationOutput: string;
  readonly smokeTestOutput?: string;
  readonly error?: string;
};

/**
 * Validate a single proposal by running its test commands in the sandbox.
 */
export async function validateProposal(
  proposal: Proposal,
  sandbox: SandboxPaths
): Promise<ValidationResult> {
  const { validationCommand, smokeTest } = proposal.testing;

  let validationOutput = '';
  let smokeTestOutput: string | undefined;
  let passed = false;

  try {
    // Run validation command
    validationOutput = execFileSync(
      '/bin/sh',
      ['-c', validationCommand.replace('~/.claude', sandbox.globalClaudeDir)],
      {
        encoding: 'utf-8',
        timeout: 30_000,
        cwd: sandbox.globalClaudeDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    passed = true;
    log.debug(`validation passed for ${proposal.id}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`validation failed for ${proposal.id}: ${message}`);
    return {
      proposalId: proposal.id,
      passed: false,
      validationOutput,
      error: message,
    };
  }

  // Run smoke test if provided
  if (smokeTest && passed) {
    try {
      smokeTestOutput = execFileSync('/bin/sh', ['-c', smokeTest], {
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      log.debug(`smoke test passed for ${proposal.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`smoke test failed for ${proposal.id}: ${message}`);
      passed = false;
      return {
        proposalId: proposal.id,
        passed: false,
        validationOutput,
        smokeTestOutput,
        error: `Smoke test failed: ${message}`,
      };
    }
  }

  return {
    proposalId: proposal.id,
    passed,
    validationOutput,
    smokeTestOutput,
  };
}

/**
 * Validate all proposals in the sandbox.
 * Returns a map of proposal ID → validation result.
 */
export async function validateAll(
  proposals: Proposal[],
  sandbox: SandboxPaths
): Promise<Map<string, ValidationResult>> {
  log.info(`validating ${proposals.length} proposals in sandbox`);
  const results = new Map<string, ValidationResult>();

  for (const proposal of proposals) {
    const result = await validateProposal(proposal, sandbox);
    results.set(proposal.id, result);
  }

  const passed = [...results.values()].filter((r) => r.passed).length;
  log.info(`validation complete: ${passed}/${proposals.length} passed`);

  return results;
}
