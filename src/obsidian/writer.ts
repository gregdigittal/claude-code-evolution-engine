/**
 * writer.ts — Write documentation artifacts to the Obsidian staging directory.
 *
 * After apply completes, CCEE writes:
 * - current-setup.md  (living config reference)
 * - review-summary.md (weekly narrative, doubles as GitHub release note)
 * - _index.md         (dashboard with Dataview queries)
 * - SVG diagrams
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import type { ConfigSnapshot } from '../audit/config-snapshot.js';
import type { Proposal } from '../proposals/generator.js';
import type { ApplyResult } from '../apply/applier.js';
import type { BenchmarkComparison } from '../testing/benchmarks.js';

const log = createTaggedLogger('obsidian-writer');

export type WeeklyRunSummary = {
  readonly runDate: string;
  readonly weekLabel: string; // e.g. "2026-W12"
  readonly sourcesScanned: number;
  readonly proposalsGenerated: number;
  readonly proposalsAccepted: number;
  readonly proposalsRejected: number;
  readonly testPassRate: number;
  readonly proposals: readonly Proposal[];
  readonly applyResults: readonly ApplyResult[];
  readonly benchmarks: BenchmarkComparison;
  readonly snapshotAfter: ConfigSnapshot;
};

/**
 * Write all documentation artifacts for a weekly run to the staging directory.
 */
export async function writeWeeklyDocumentation(
  summary: WeeklyRunSummary,
  stagingPath: string,
  weeklyReviewSvg?: string,
  currentSetupSvg?: string
): Promise<void> {
  const cceeDir = join(stagingPath, 'CCEE');
  const weekDir = join(cceeDir, 'Weekly-Reviews', summary.weekLabel);
  const archDir = join(cceeDir, 'Architecture');

  mkdirSync(weekDir, { recursive: true });
  mkdirSync(archDir, { recursive: true });

  // Write review summary
  writeFileSync(
    join(weekDir, 'review-summary.md'),
    buildReviewSummary(summary),
    'utf-8'
  );

  // Write changes applied
  writeFileSync(
    join(weekDir, 'changes-applied.md'),
    buildChangesApplied(summary),
    'utf-8'
  );

  // Write metrics
  writeFileSync(
    join(weekDir, 'metrics.md'),
    buildMetrics(summary),
    'utf-8'
  );

  // Update current-setup.md
  writeFileSync(
    join(archDir, 'current-setup.md'),
    buildCurrentSetup(summary),
    'utf-8'
  );

  // Write SVGs if provided
  if (weeklyReviewSvg) {
    writeFileSync(join(weekDir, 'before-after.svg'), weeklyReviewSvg, 'utf-8');
  }
  if (currentSetupSvg) {
    writeFileSync(join(archDir, 'current-setup.svg'), currentSetupSvg, 'utf-8');
  }

  // Update _index.md
  writeFileSync(join(cceeDir, '_index.md'), buildIndexDashboard(summary), 'utf-8');

  log.info(`documentation written to ${cceeDir}`);
}

function buildReviewSummary(summary: WeeklyRunSummary): string {
  const accepted = summary.proposals.filter((p) =>
    summary.applyResults.some((r) => r.proposalId === p.id && r.success)
  );
  const rejected = summary.proposals.filter(
    (p) => !accepted.some((a) => a.id === p.id)
  );

  return `---
week: ${summary.weekLabel}
run_date: ${summary.runDate}
sources_scanned: ${summary.sourcesScanned}
proposals_generated: ${summary.proposalsGenerated}
proposals_accepted: ${summary.proposalsAccepted}
proposals_rejected: ${summary.proposalsRejected}
test_pass_rate: ${(summary.testPassRate * 100).toFixed(0)}%
---

# CCEE Weekly Review — ${summary.weekLabel}

## Changes Applied

${accepted.map((p, i) => `### ${i + 1}. ${p.title} (${p.priority})
**Scope:** ${p.scope}
**Category:** ${p.category}
**Risk:** ${p.risk}
**Impact:** ${p.estimatedImpact}
**Capability delta:** ${p.capabilityDelta}
`).join('\n')}

## Changes Rejected

${rejected.map((p, i) => `### ${i + 1}. ${p.title}
**Reason:** Rejected by operator during review
`).join('\n')}

## Before / After

![[before-after.svg]]
`.trim();
}

function buildChangesApplied(summary: WeeklyRunSummary): string {
  return `# Changes Applied — ${summary.weekLabel}

${summary.applyResults
  .filter((r) => r.success)
  .map((r) => {
    const proposal = summary.proposals.find((p) => p.id === r.proposalId);
    return `## ${r.proposalId}: ${proposal?.title ?? 'Unknown'}
Changes applied: ${r.changesApplied}
`;
  })
  .join('\n')}
`;
}

function buildMetrics(summary: WeeklyRunSummary): string {
  const { before, after, delta } = summary.benchmarks;
  return `# Metrics — ${summary.weekLabel}

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Skills | ${before.skillCount} | ${after.skillCount} | ${delta.skillCount > 0 ? '+' : ''}${delta.skillCount} |
| Hooks | ${before.hookCount} | ${after.hookCount} | ${delta.hookCount > 0 ? '+' : ''}${delta.hookCount} |
| Agents | ${before.agentCount} | ${after.agentCount} | ${delta.agentCount > 0 ? '+' : ''}${delta.agentCount} |
| Rules | ${before.ruleCount} | ${after.ruleCount} | ${delta.ruleCount > 0 ? '+' : ''}${delta.ruleCount} |
| Est. context tokens | ${before.estimatedContextTokens} | ${after.estimatedContextTokens} | ${delta.estimatedContextTokens > 0 ? '+' : ''}${delta.estimatedContextTokens} |
`;
}

function buildCurrentSetup(summary: WeeklyRunSummary): string {
  const snap = summary.snapshotAfter;
  return `---
updated: ${summary.runDate}
ccee_run: ${summary.weekLabel}
total_skills: ${snap.globalConfig.counts.skills}
total_hooks: ${snap.globalConfig.counts.hooks}
total_agents: ${snap.globalConfig.counts.agents}
total_commands: ${snap.globalConfig.counts.commands}
total_rules: ${snap.globalConfig.counts.rules}
---

# Current Claude Code VPS Configuration

## Architecture Diagram

![[current-setup.svg]]

## Global Configuration (\`~/.claude/\`)

### File listing
${snap.globalConfig.files.map((f) => `- \`${f.relativePath}\``).join('\n')}

## Project Configs

${snap.projectConfigs
  .filter((p) => p.exists)
  .map(
    (p) => `### ${p.label}
Files: ${p.counts.total}
`
  )
  .join('\n')}
`;
}

function buildIndexDashboard(summary: WeeklyRunSummary): string {
  return `---
updated: ${summary.runDate}
---

# CCEE Dashboard

## Latest Run: ${summary.weekLabel}

| Metric | Value |
|--------|-------|
| Run date | ${summary.runDate} |
| Sources scanned | ${summary.sourcesScanned} |
| Proposals generated | ${summary.proposalsGenerated} |
| Proposals accepted | ${summary.proposalsAccepted} |
| Test pass rate | ${(summary.testPassRate * 100).toFixed(0)}% |

## Weekly Reviews

\`\`\`dataview
TABLE run_date, proposals_accepted, proposals_rejected, test_pass_rate
FROM "CCEE/Weekly-Reviews"
WHERE file.name = "review-summary"
SORT run_date DESC
LIMIT 12
\`\`\`
`;
}
