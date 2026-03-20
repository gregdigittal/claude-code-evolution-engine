/**
 * healer.ts — Heal Engine for failed proposals.
 *
 * Analyses a failed proposal's tier1 failures and produces one of three verdicts:
 *   - 'fixed'       — corrected proposedChanges re-passed tier1
 *   - 'blocked'     — hard conflict, cannot be auto-healed
 *   - 'replacement' — proposal is superior to an existing file; delete-then-create bundle
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import { runTier1 } from './validator.js';
import type { Proposal, ProposedChange } from '../proposals/generator.js';
import type { ProposalTestResult } from './validator.js';

const log = createTaggedLogger('healer');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealVerdict = 'fixed' | 'blocked' | 'replacement';

export type HealResult = {
  readonly verdict: HealVerdict;
  readonly blockReason?: string;
  readonly fixReason?: string;
  readonly fixedProposal?: Proposal;
  readonly replacementProposal?: Proposal;
  readonly existingFeatureName?: string;
  readonly superiorityReason?: string;
  readonly capabilityDelta?: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Recursively list all files under a directory, returning paths relative to dir. */
function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const child of listFilesRecursive(fullPath)) {
        results.push(join(entry.name, child));
      }
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

/** Classify a tier1 failure as 'path' (fixable) or 'other'. */
function classifyFailure(failure: string): 'path' | 'other' {
  if (
    failure.startsWith('modify target not found:') ||
    failure.startsWith('parent directory not found for:') ||
    failure.startsWith('invalid JSON in diff/content for') ||
    failure.includes('bash syntax error in') ||
    failure.includes('missing shebang in')
  ) {
    return 'path';
  }
  return 'other';
}

/** Append a proposal to proposals.json in the runDir (read → push → write). */
function appendToProposalsFile(runDir: string, proposal: Proposal): void {
  const proposalsPath = join(runDir, 'proposals.json');
  let existing: unknown[] = [];
  if (existsSync(proposalsPath)) {
    try {
      existing = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as unknown[];
    } catch {
      existing = [];
    }
  }
  existing.push(proposal);
  writeFileSync(proposalsPath, JSON.stringify(existing, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// FIXABLE path
// ---------------------------------------------------------------------------

async function attemptFix(
  proposal: Proposal,
  tier1Failures: readonly string[],
  homeDir: string,
  runDir: string
): Promise<HealResult> {
  const claudeDir = join(homeDir, '.claude');
  const realFiles = listFilesRecursive(claudeDir)
    .map((f) => join('~/.claude', f))
    .slice(0, 100); // cap at 100 entries

  // Truncate proposedChanges — only action + path (content/diff can be huge)
  const truncatedChanges = proposal.proposedChanges.map((c) => ({
    action: c.action,
    path: c.path,
  }));

  // Embed context directly in the prompt so it's always present regardless of
  // whether the SDK module or CLI subprocess path is used.
  const fixPrompt = [
    'You are a CCEE fix engine. A proposal failed tier1 validation.',
    'Analyse the failures and the real file list, then return a corrected proposedChanges array.',
    'Common causes: wrong file paths (e.g. config.json → settings.json, hooks.json → hooks/ directory).',
    'Correct the paths to match the actual filesystem.',
    'Return ONLY a valid JSON array of ProposedChange objects — no markdown fences, no explanation.',
    'Each object must have: action ("create"|"modify"|"delete"|"rename"), path (string).',
    '',
    '## Proposal to Fix',
    `Title: ${proposal.title}`,
    `ID: ${proposal.id}`,
    '',
    '## Tier 1 Failures (these are the paths that are wrong)',
    tier1Failures.map((f) => `- ${f}`).join('\n'),
    '',
    '## Actual ~/.claude/ file list (use these exact paths)',
    realFiles.map((f) => `- ${f}`).join('\n'),
    '',
    '## Original proposedChanges (action+path only — correct the paths)',
    JSON.stringify(truncatedChanges, null, 2),
    '',
    'Now return the corrected JSON array:',
  ].join('\n');

  const result = await querySonnet({
    prompt: fixPrompt,
    phaseName: 'healer-fix',
  });

  if (!result.success) {
    const reason = result.error ?? 'querySonnet failed';
    log.info(`healer: [${proposal.id}] verdict=blocked reason=fix-query-failed: ${reason}`);
    return { verdict: 'blocked', blockReason: `Fix query failed: ${reason}` };
  }

  // Parse the corrected proposedChanges
  let correctedChanges: ProposedChange[];
  try {
    const jsonMatch = result.output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    correctedChanges = JSON.parse(jsonMatch[0]) as ProposedChange[];
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    log.info(`healer: [${proposal.id}] verdict=blocked reason=fix-parse-failed: ${msg}`);
    return { verdict: 'blocked', blockReason: `Could not parse corrected changes: ${msg}` };
  }

  // Build the corrected proposal — cast via Record<string, unknown> to add extra fields
  const fixReason = `Corrected path/schema issues: ${tier1Failures.slice(0, 3).join('; ')}`;
  const correctedRecord: Record<string, unknown> = {
    ...proposal,
    id: `${proposal.id}-FIX`,
    proposedChanges: correctedChanges,
    amendedFrom: proposal.id,
    fixReason,
  };
  const correctedProposal = correctedRecord as unknown as Proposal;

  // Re-run tier1 on the corrected proposal — no second fix round
  const reTier1 = runTier1(correctedProposal, homeDir);
  if (reTier1.status !== 'pass') {
    const blockReason = reTier1.failures[0] ?? 'tier1 still failing after fix attempt';
    log.info(`healer: [${proposal.id}] verdict=blocked reason=fix-still-failing: ${blockReason}`);
    return { verdict: 'blocked', blockReason };
  }

  // Append fixed proposal to proposals.json
  appendToProposalsFile(runDir, correctedProposal);

  log.info(`healer: [${proposal.id}] verdict=fixed reason=${fixReason}`);
  return { verdict: 'fixed', fixReason, fixedProposal: correctedProposal };
}

// ---------------------------------------------------------------------------
// SUPERIORITY path
// ---------------------------------------------------------------------------

async function attemptSuperiority(
  proposal: Proposal,
  collidingPaths: string[],
  homeDir: string,
  runDir: string
): Promise<HealResult> {
  const existingFilePath = collidingPaths[0] ?? '';
  const resolvedExisting = existingFilePath.replace(/^~/, homeDir);
  let existingContent = '';
  try {
    existingContent = readFileSync(resolvedExisting, 'utf-8');
  } catch {
    existingContent = '(could not read existing file)';
  }

  const superiorityPrompt = [
    'You are evaluating whether a proposed file is superior to an existing file it would overwrite.',
    'Answer: does the new proposal provide the same capability as the existing file?',
    'Does it provide additional capability?',
    'Return ONLY valid JSON (no markdown fences):',
    '{ "superior": boolean, "reason": string, "capabilityDelta": string }',
    '"superior" must be true only if the new version is meaningfully better or at least equivalent.',
    '',
    `## Proposal`,
    `Title: ${proposal.title}`,
    `ID: ${proposal.id}`,
    `Capability Delta described in proposal: ${proposal.capabilityDelta}`,
    '',
    `## Colliding existing file: ${existingFilePath}`,
    `Content (first 2000 chars):`,
    existingContent.slice(0, 2000),
    '',
    `## Proposed new content (action+path)`,
    JSON.stringify(
      proposal.proposedChanges
        .filter((c) => c.path === existingFilePath)
        .map((c) => ({ action: c.action, path: c.path })),
      null,
      2
    ),
    '',
    'Return ONLY the JSON object now:',
  ].join('\n');

  const result = await querySonnet({
    prompt: superiorityPrompt,
    phaseName: 'healer-superiority',
  });

  if (!result.success) {
    const reason = result.error ?? 'querySonnet failed';
    log.info(
      `healer: [${proposal.id}] verdict=blocked reason=superiority-query-failed: ${reason}`
    );
    return { verdict: 'blocked', blockReason: `Superiority query failed: ${reason}` };
  }

  let superior = false;
  let superiorityReason = '';
  let capabilityDelta = '';

  try {
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    const parsed = JSON.parse(jsonMatch[0]) as {
      superior?: boolean;
      reason?: string;
      capabilityDelta?: string;
    };
    superior = parsed.superior === true;
    superiorityReason = String(parsed.reason ?? '');
    capabilityDelta = String(parsed.capabilityDelta ?? '');
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    log.info(
      `healer: [${proposal.id}] verdict=blocked reason=superiority-parse-failed: ${msg}`
    );
    return { verdict: 'blocked', blockReason: `Could not parse superiority response: ${msg}` };
  }

  if (!superior) {
    log.info(
      `healer: [${proposal.id}] verdict=blocked reason=not-superior: ${superiorityReason}`
    );
    return {
      verdict: 'blocked',
      blockReason: `Proposal is not superior to existing file at ${existingFilePath}: ${superiorityReason}`,
    };
  }

  // Build replacement bundle: delete existing first, then original changes
  const replacementChanges: ProposedChange[] = [
    { action: 'delete', path: existingFilePath },
    ...proposal.proposedChanges,
  ];

  const existingFeatureName = existingFilePath.split('/').pop() ?? existingFilePath;

  const replacementRecord: Record<string, unknown> = {
    ...proposal,
    id: `${proposal.id}-REPLACE`,
    proposedChanges: replacementChanges,
    breakingChanges: true,
    superiorityReason,
    capabilityDelta,
  };
  const replacementProposal = replacementRecord as unknown as Proposal;

  appendToProposalsFile(runDir, replacementProposal);

  log.info(
    `healer: [${proposal.id}] verdict=replacement existingFeature=${existingFeatureName} reason=${superiorityReason}`
  );
  return {
    verdict: 'replacement',
    existingFeatureName,
    superiorityReason,
    capabilityDelta,
    replacementProposal,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function healProposal(
  proposal: Proposal,
  testResult: ProposalTestResult,
  homeDir: string,
  runDir: string
): Promise<HealResult | null> {
  // No healing needed if the proposal passed
  if (testResult.overall === 'pass') {
    return null;
  }

  const tier1Failures = testResult.tier1.failures;

  // Tier2/tier3 failures are not healable by the path/schema engine
  if (tier1Failures.length === 0) {
    const blockReason = 'Failed at tier2/tier3 — not a path or schema issue';
    log.info(`healer: [${proposal.id}] verdict=blocked reason=${blockReason}`);
    return { verdict: 'blocked', blockReason };
  }

  // Check for collision: proposal tries to create a file that already exists
  const collidingPaths: string[] = [];
  for (const change of proposal.proposedChanges) {
    if (change.action === 'create') {
      const resolved = change.path.replace(/^~/, homeDir);
      if (existsSync(resolved)) {
        collidingPaths.push(change.path);
      }
    }
  }

  if (collidingPaths.length > 0) {
    return attemptSuperiority(proposal, collidingPaths, homeDir, runDir);
  }

  // Check whether all tier1 failures are fixable path/schema/syntax issues
  const allFixable = tier1Failures.every((f) => classifyFailure(f) === 'path');

  if (allFixable) {
    return attemptFix(proposal, tier1Failures, homeDir, runDir);
  }

  // HARD CONFLICT
  const blockReason = tier1Failures[0] ?? 'unknown tier1 failure';
  log.info(`healer: [${proposal.id}] verdict=blocked reason=${blockReason}`);
  return { verdict: 'blocked', blockReason };
}
