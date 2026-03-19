/**
 * proposals.test.ts — Tests for the proposals phase modules.
 */

import { describe, it, expect } from 'vitest';
import type { Proposal } from '../src/proposals/generator.js';

const mockProposals: Proposal[] = [
  {
    id: 'CCEE-001',
    title: 'Add Agent Teams',
    category: 'feature_adoption',
    scope: 'global',
    priority: 'P1_high',
    risk: 'medium',
    authorityType: 'addition',
    capabilityDelta: 'New capability',
    sourceRecommendations: [],
    proposedChanges: [],
    rollbackProcedure: { backupPath: '~/.ccee/backups/', restoreCommands: [] },
    testing: { validationCommand: 'echo ok', expectedOutcome: 'ok' },
    dependencies: [],
    breakingChanges: false,
    estimatedImpact: 'Enables parallel agent execution',
  },
  {
    id: 'CCEE-002',
    title: 'Remove legacy hook',
    category: 'legacy_removal',
    scope: 'global',
    priority: 'P2_medium',
    risk: 'low',
    authorityType: 'removal',
    capabilityDelta: 'No loss',
    sourceRecommendations: [],
    proposedChanges: [],
    rollbackProcedure: { backupPath: '~/.ccee/backups/', restoreCommands: [] },
    testing: { validationCommand: 'echo ok', expectedOutcome: 'ok' },
    dependencies: [],
    breakingChanges: false,
    estimatedImpact: 'Reduces hook overhead',
  },
  {
    id: 'CCEE-003',
    title: 'Security patch',
    category: 'security_patch',
    scope: 'global',
    priority: 'P0_critical',
    risk: 'low',
    authorityType: 'modification',
    capabilityDelta: 'Improves security',
    sourceRecommendations: [],
    proposedChanges: [],
    rollbackProcedure: { backupPath: '~/.ccee/backups/', restoreCommands: [] },
    testing: { validationCommand: 'echo ok', expectedOutcome: 'ok' },
    dependencies: [],
    breakingChanges: false,
    estimatedImpact: 'Closes security gap',
  },
];

describe('proposals/prioritiser', () => {
  it('sorts P0 before P1 before P2', async () => {
    const { sortProposals } = await import('../src/proposals/prioritiser.js');
    const sorted = sortProposals([...mockProposals]);
    expect(sorted[0]!.priority).toBe('P0_critical');
    expect(sorted[1]!.priority).toBe('P1_high');
    expect(sorted[2]!.priority).toBe('P2_medium');
  });

  it('groups proposals by priority', async () => {
    const { groupByPriority } = await import('../src/proposals/prioritiser.js');
    const groups = groupByPriority(mockProposals);
    expect(groups.P0_critical).toHaveLength(1);
    expect(groups.P1_high).toHaveLength(1);
    expect(groups.P2_medium).toHaveLength(1);
    expect(groups.P3_low).toHaveLength(0);
  });

  it('suggestAutoAccept returns only safe P0+P1 proposals', async () => {
    const { suggestAutoAccept } = await import('../src/proposals/prioritiser.js');
    const ids = suggestAutoAccept(mockProposals);
    // P0 and P1 proposals that are not breaking/high risk should be included
    expect(ids).toContain('CCEE-003'); // P0, low risk
    expect(ids).toContain('CCEE-001'); // P1, medium risk — medium is acceptable for auto-accept
    // P2 should NOT be included (not P0 or P1)
    expect(ids).not.toContain('CCEE-002');
  });
});

describe('proposals/conflict-detector', () => {
  it('detects no conflicts for non-overlapping proposals', async () => {
    const { detectConflicts } = await import('../src/proposals/conflict-detector.js');
    const result = detectConflicts(mockProposals);
    expect(result.conflicts).toHaveLength(0);
  });

  it('detects file overlap conflict', async () => {
    const { detectConflicts } = await import('../src/proposals/conflict-detector.js');
    const conflicting: Proposal[] = [
      {
        ...mockProposals[0]!,
        proposedChanges: [{ action: 'modify', path: '~/.claude/settings.json' }],
      },
      {
        ...mockProposals[1]!,
        proposedChanges: [{ action: 'modify', path: '~/.claude/settings.json' }],
      },
    ];
    const result = detectConflicts(conflicting);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]!.type).toBe('file-overlap');
  });
});

describe('proposals/dependency-resolver', () => {
  it('returns proposals in dependency order', async () => {
    const { resolveDependencies } = await import('../src/proposals/dependency-resolver.js');
    const withDeps: Proposal[] = [
      { ...mockProposals[1]!, dependencies: ['CCEE-003'] },
      { ...mockProposals[0]!, dependencies: [] },
      { ...mockProposals[2]!, dependencies: [] },
    ];
    const result = resolveDependencies(withDeps);
    expect(result.cycles).toHaveLength(0);
    // CCEE-003 (no deps) should come before CCEE-002 (depends on 003)
    const ids = result.ordered.map((p) => p.id);
    expect(ids.indexOf('CCEE-003')).toBeLessThan(ids.indexOf('CCEE-002'));
  });
});
