/**
 * dependency-resolver.ts — Resolve dependency chains between proposals.
 *
 * Produces an ordered apply sequence respecting dependencies.
 * Removes proposals whose dependencies have been rejected.
 */

import { createTaggedLogger } from '../utils/logger.js';
import type { Proposal } from './generator.js';

const log = createTaggedLogger('dependency-resolver');

export type ApplyOrder = {
  readonly ordered: readonly Proposal[];
  readonly cycles: readonly string[][];
  readonly orphaned: readonly string[]; // IDs with missing dependencies
};

/**
 * Topologically sort proposals respecting dependency chains.
 * Proposals with no dependencies come first.
 */
export function resolveDependencies(proposals: Proposal[]): ApplyOrder {
  const idToProposal = new Map<string, Proposal>(
    proposals.map((p) => [p.id, p])
  );

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const p of proposals) {
    inDegree.set(p.id, p.dependencies.length);
    adjList.set(p.id, []);
  }

  // Build reverse adjacency (dependency → dependent)
  const orphaned: string[] = [];
  for (const p of proposals) {
    for (const dep of p.dependencies) {
      if (!idToProposal.has(dep)) {
        log.warn(`${p.id} depends on unknown proposal ${dep}`);
        orphaned.push(p.id);
        continue;
      }
      adjList.get(dep)!.push(p.id);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(id);
  }

  const ordered: Proposal[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const proposal = idToProposal.get(id);
    if (proposal) ordered.push(proposal);

    for (const dependent of adjList.get(id) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) queue.push(dependent);
    }
  }

  // Any remaining with in-degree > 0 are in cycles
  const cycles: string[][] = [];
  const remaining = [...inDegree.entries()]
    .filter(([, d]) => d > 0)
    .map(([id]) => id);

  if (remaining.length > 0) {
    log.warn(`dependency cycles detected involving: ${remaining.join(', ')}`);
    cycles.push(remaining);
  }

  log.info(
    `dependency resolution: ${ordered.length} proposals ordered, ` +
      `${cycles.length} cycles, ${orphaned.length} orphaned`
  );

  return { ordered, cycles, orphaned };
}

/**
 * Filter out proposals whose required dependencies were rejected.
 */
export function removeOrphaned(
  proposals: Proposal[],
  acceptedIds: Set<string>
): Proposal[] {
  return proposals.filter((p) => {
    for (const dep of p.dependencies) {
      if (!acceptedIds.has(dep)) {
        log.warn(`removing ${p.id}: dependency ${dep} was not accepted`);
        return false;
      }
    }
    return true;
  });
}
