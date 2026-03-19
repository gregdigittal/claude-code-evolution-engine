/**
 * applier.ts — Atomically apply accepted proposals in dependency order.
 *
 * Safety: backup must exist before apply is called.
 * On failure: rollback that proposal and its dependents.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';
import { rollbackProposal } from './rollback.js';
import type { Proposal, ProposedChange } from '../proposals/generator.js';

const log = createTaggedLogger('applier');

const HOME = homedir();

export type ApplyResult = {
  readonly proposalId: string;
  readonly success: boolean;
  readonly changesApplied: number;
  readonly error?: string;
  readonly rolledBack: boolean;
};

/**
 * Apply a single proposal's changes to the real config.
 */
export async function applyProposal(
  proposal: Proposal,
  backupBaseDir: string,
  runDate: string
): Promise<ApplyResult> {
  log.info(`applying proposal: ${proposal.id} — ${proposal.title}`);

  const appliedPaths: string[] = [];
  let changesApplied = 0;

  try {
    for (const change of proposal.proposedChanges) {
      const absolutePath = resolveConfigPath(change.path);
      applyChange(change, absolutePath);
      appliedPaths.push(absolutePath);
      changesApplied++;
    }

    log.info(`${proposal.id}: applied ${changesApplied} changes`);
    return { proposalId: proposal.id, success: true, changesApplied, rolledBack: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`${proposal.id} failed: ${message}`);

    // Rollback the failed proposal
    try {
      rollbackProposal(backupBaseDir, runDate, proposal.id, appliedPaths);
      log.info(`${proposal.id}: rolled back successfully`);
    } catch (rollbackErr: unknown) {
      const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
      log.error(`${proposal.id}: rollback also failed: ${rbMsg}`);
    }

    return {
      proposalId: proposal.id,
      success: false,
      changesApplied,
      error: message,
      rolledBack: true,
    };
  }
}

/**
 * Apply all accepted proposals in order.
 */
export async function applyAll(
  proposals: Proposal[],
  backupBaseDir: string,
  runDate: string
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const failedIds = new Set<string>();

  for (const proposal of proposals) {
    // Skip if a dependency failed
    const depFailed = proposal.dependencies.some((dep) => failedIds.has(dep));
    if (depFailed) {
      log.warn(`${proposal.id}: skipped — dependency failed`);
      results.push({
        proposalId: proposal.id,
        success: false,
        changesApplied: 0,
        error: 'Dependency failed',
        rolledBack: false,
      });
      failedIds.add(proposal.id);
      continue;
    }

    const result = await applyProposal(proposal, backupBaseDir, runDate);
    results.push(result);

    if (!result.success) {
      failedIds.add(proposal.id);
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  log.info(`apply complete: ${succeeded}/${proposals.length} proposals applied`);

  return results;
}

function resolveConfigPath(configPath: string): string {
  if (configPath.startsWith('~/')) {
    return join(HOME, configPath.slice(2));
  }
  if (configPath.startsWith('~/.claude')) {
    return join(HOME, '.claude', configPath.slice('~/.claude/'.length));
  }
  return configPath;
}

function applyChange(change: ProposedChange, absolutePath: string): void {
  switch (change.action) {
    case 'delete': {
      if (existsSync(absolutePath)) {
        rmSync(absolutePath, { recursive: true, force: true });
        log.debug(`deleted: ${absolutePath}`);
      }
      break;
    }

    case 'create': {
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, change.content ?? '', 'utf-8');
      log.debug(`created: ${absolutePath}`);
      break;
    }

    case 'modify': {
      if (!existsSync(absolutePath)) {
        throw new Error(`Cannot modify non-existent file: ${absolutePath}`);
      }
      if (change.content !== undefined) {
        writeFileSync(absolutePath, change.content, 'utf-8');
      }
      // TODO: Apply unified diff when change.diff is provided
      log.debug(`modified: ${absolutePath}`);
      break;
    }

    case 'rename': {
      if (!existsSync(absolutePath)) {
        throw new Error(`Cannot rename non-existent file: ${absolutePath}`);
      }
      // content field holds the new path for renames
      const newPath = resolveConfigPath(change.content ?? '');
      mkdirSync(dirname(newPath), { recursive: true });
      renameSync(absolutePath, newPath);
      log.debug(`renamed: ${absolutePath} → ${newPath}`);
      break;
    }

    default: {
      log.warn(`unknown action for ${absolutePath}`);
    }
  }
}
