/**
 * conflict-detector.ts — Detect conflicts between proposals.
 *
 * Identifies inter-proposal conflicts (two proposals touching the same file),
 * scope collisions, and recent operator modifications.
 */

import { statSync } from 'node:fs';
import { createTaggedLogger } from '../utils/logger.js';
import type { Proposal } from './generator.js';

const log = createTaggedLogger('conflict-detector');

export type Conflict = {
  readonly proposalIds: readonly [string, string];
  readonly type: 'file-overlap' | 'scope-collision' | 'dependency-gap';
  readonly description: string;
  readonly severity: 'blocking' | 'warning';
};

export type RecentModification = {
  readonly path: string;
  readonly modifiedAtMs: number;
  readonly proposalId: string;
};

/**
 * Detect all conflicts in a set of proposals.
 */
export function detectConflicts(proposals: Proposal[]): {
  conflicts: Conflict[];
  recentModifications: RecentModification[];
} {
  const conflicts = detectFileOverlaps(proposals);
  const recentModifications = detectRecentModifications(proposals);

  if (conflicts.length > 0) {
    log.warn(`${conflicts.length} conflicts detected`);
  }

  return { conflicts, recentModifications };
}

/**
 * Find proposals that modify the same files.
 */
function detectFileOverlaps(proposals: Proposal[]): Conflict[] {
  const fileToProposals = new Map<string, string[]>();

  for (const proposal of proposals) {
    for (const change of proposal.proposedChanges) {
      const existing = fileToProposals.get(change.path) ?? [];
      existing.push(proposal.id);
      fileToProposals.set(change.path, existing);
    }
  }

  const conflicts: Conflict[] = [];

  for (const [file, proposalIds] of fileToProposals.entries()) {
    if (proposalIds.length > 1) {
      // Generate pairs
      for (let i = 0; i < proposalIds.length - 1; i++) {
        for (let j = i + 1; j < proposalIds.length; j++) {
          conflicts.push({
            proposalIds: [proposalIds[i]!, proposalIds[j]!],
            type: 'file-overlap',
            description: `Both proposals modify ${file}`,
            severity: 'blocking',
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Check if any proposal targets a file modified by the operator in the last 7 days.
 */
function detectRecentModifications(
  proposals: Proposal[]
): RecentModification[] {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const results: RecentModification[] = [];

  for (const proposal of proposals) {
    for (const change of proposal.proposedChanges) {
      try {
        const stat = statSync(change.path);
        if (stat.mtimeMs > sevenDaysAgo) {
          results.push({
            path: change.path,
            modifiedAtMs: stat.mtimeMs,
            proposalId: proposal.id,
          });
        }
      } catch {
        // File doesn't exist yet — fine for create actions
      }
    }
  }

  return results;
}
