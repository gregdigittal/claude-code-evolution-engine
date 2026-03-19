/**
 * prioritiser.ts — Sort and filter proposals by priority and risk.
 */

import { createTaggedLogger } from '../utils/logger.js';
import type { Proposal, ProposalPriority } from './generator.js';

const log = createTaggedLogger('prioritiser');

const PRIORITY_ORDER: Record<ProposalPriority, number> = {
  P0_critical: 0,
  P1_high: 1,
  P2_medium: 2,
  P3_low: 3,
};

/**
 * Sort proposals by priority, then by risk (lower risk first within same priority).
 */
export function sortProposals(proposals: Proposal[]): Proposal[] {
  return [...proposals].sort((a, b) => {
    const priorityDiff =
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // Within same priority: safer changes first
    const riskOrder = { low: 0, medium: 1, high: 2, breaking: 3 };
    return riskOrder[a.risk] - riskOrder[b.risk];
  });
}

/**
 * Filter proposals by priority threshold.
 */
export function filterByPriority(
  proposals: Proposal[],
  minPriority: ProposalPriority
): Proposal[] {
  const threshold = PRIORITY_ORDER[minPriority];
  return proposals.filter(
    (p) => PRIORITY_ORDER[p.priority] <= threshold
  );
}

/**
 * Group proposals by priority tier.
 */
export function groupByPriority(
  proposals: Proposal[]
): Record<ProposalPriority, Proposal[]> {
  const groups: Record<ProposalPriority, Proposal[]> = {
    P0_critical: [],
    P1_high: [],
    P2_medium: [],
    P3_low: [],
  };

  for (const proposal of proposals) {
    groups[proposal.priority].push(proposal);
  }

  log.info(
    `prioritisation: P0=${groups.P0_critical.length}, P1=${groups.P1_high.length}, ` +
      `P2=${groups.P2_medium.length}, P3=${groups.P3_low.length}`
  );

  return groups;
}

/**
 * Auto-select safe proposals for bulk acceptance suggestion.
 * Returns IDs of proposals safe to bulk-accept (P0+P1, tested, not breaking).
 */
export function suggestAutoAccept(proposals: Proposal[]): string[] {
  return proposals
    .filter(
      (p) =>
        (p.priority === 'P0_critical' || p.priority === 'P1_high') &&
        !p.breakingChanges &&
        p.risk !== 'breaking' &&
        p.risk !== 'high'
    )
    .map((p) => p.id);
}
