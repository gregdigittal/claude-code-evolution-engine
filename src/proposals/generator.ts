/**
 * generator.ts — Generate structured change proposals from intelligence + audit data.
 *
 * Each proposal is self-contained with rollback procedures and testing commands.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import type { IntelligenceReport } from '../research/intelligence-merger.js';
import type { ConfigDirectory, ConfigSnapshot } from '../audit/config-snapshot.js';
import type { LegacyAnalysis } from '../audit/legacy-analyser.js';

const log = createTaggedLogger('proposal-generator');

export type ProposalCategory =
  | 'feature_adoption'
  | 'config_update'
  | 'skill_add'
  | 'skill_update'
  | 'skill_remove'
  | 'hook_add'
  | 'hook_update'
  | 'hook_remove'
  | 'agent_add'
  | 'agent_replace'
  | 'plugin_install'
  | 'plugin_update'
  | 'framework_integrate'
  | 'legacy_removal'
  | 'consolidation'
  | 'security_patch'
  | 'performance';

export type ProposalRisk = 'breaking' | 'high' | 'medium' | 'low';
export type ProposalPriority = 'P0_critical' | 'P1_high' | 'P2_medium' | 'P3_low';

export type ProposedChange = {
  readonly action: 'create' | 'modify' | 'delete' | 'rename';
  readonly path: string;
  readonly diff?: string;
  readonly content?: string;
};

export type Proposal = {
  readonly id: string;
  readonly title: string;
  readonly category: ProposalCategory;
  readonly scope: string;
  readonly priority: ProposalPriority;
  readonly risk: ProposalRisk;
  readonly authorityType: 'addition' | 'modification' | 'replacement' | 'removal';
  readonly replaces?: readonly string[];
  readonly capabilityDelta: string;
  readonly sourceRecommendations: readonly string[];
  readonly currentStateHash?: string;
  readonly proposedChanges: readonly ProposedChange[];
  readonly rollbackProcedure: {
    readonly backupPath: string;
    readonly restoreCommands: readonly string[];
  };
  readonly testing: {
    readonly validationCommand: string;
    readonly expectedOutcome: string;
    readonly smokeTest?: string;
  };
  readonly dependencies: readonly string[];
  readonly breakingChanges: boolean;
  readonly estimatedImpact: string;
};

/**
 * Generate proposals from intelligence report + audit findings.
 */
export async function generateProposals(
  intelligence: IntelligenceReport,
  snapshot: ConfigSnapshot,
  legacyAnalysis: LegacyAnalysis,
  runDate: string,
  outputDir: string
): Promise<Proposal[]> {
  log.info('generating change proposals');

  // Derive homeDir from the snapshot so path resolution is consistent
  const homeDir = snapshot.globalConfig.absolutePath.replace(/\/\.claude$/, '');

  const prompt = buildProposalPrompt(intelligence, snapshot, legacyAnalysis, runDate, homeDir);
  const result = await querySonnet({
    prompt,
    phaseName: 'proposal-generation',
    systemPrompt:
      'You are the CCEE proposal generator. Output only valid JSON array of proposals.',
  });

  let proposals: Proposal[] = [];

  if (result.success) {
    try {
      const jsonMatch = result.output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        proposals = JSON.parse(jsonMatch[0]) as Proposal[];
        log.info(`generated ${proposals.length} raw proposals`);
      }
    } catch (err: unknown) {
      log.warn(`failed to parse proposals: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log.error(`proposal generation failed: ${result.error ?? 'unknown'}`);
  }

  // Drop modify/delete changes that reference non-existent paths (defensive filter)
  proposals = filterUnresolvablePaths(proposals, snapshot, homeDir);
  log.info(`after path filter: ${proposals.length} proposals retained`);

  // Ensure all proposals have IDs
  proposals = proposals.map((p, idx) => ({
    ...p,
    id: p.id || `CCEE-${runDate.replace(/-/g, '')}-${String(idx + 1).padStart(3, '0')}`,
  }));

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'proposals.json'),
    JSON.stringify(proposals, null, 2),
    'utf-8'
  );

  return proposals;
}

// ---------------------------------------------------------------------------
// Path self-check — strip modify/delete changes to paths that don't exist
// ---------------------------------------------------------------------------

function filterUnresolvablePaths(
  proposals: Proposal[],
  snapshot: ConfigSnapshot,
  homeDir: string
): Proposal[] {
  // Build a set of all known absolute paths in the global config
  const knownPaths = new Set<string>(
    snapshot.globalConfig.files.map((f) => f.path)
  );
  // Also add the directory itself and immediate subdirectory paths
  knownPaths.add(snapshot.globalConfig.absolutePath);

  return proposals.map((proposal) => {
    const filtered: ProposedChange[] = [];
    for (const change of proposal.proposedChanges) {
      if (change.action === 'modify' || change.action === 'delete') {
        const absPath = change.path.replace(/^~/, homeDir);
        if (!existsSync(absPath) && !knownPaths.has(absPath)) {
          log.warn(
            `[${proposal.id}] dropping ${change.action} of non-existent path: ${change.path}`
          );
          continue;
        }
      }
      filtered.push(change);
    }

    if (filtered.length === proposal.proposedChanges.length) return proposal;

    // Return a new proposal object with the filtered changes
    const updated: Record<string, unknown> = { ...proposal, proposedChanges: filtered };
    return updated as unknown as Proposal;
  });
}

function buildProposalPrompt(
  intelligence: IntelligenceReport,
  snapshot: ConfigSnapshot,
  legacyAnalysis: LegacyAnalysis,
  runDate: string,
  homeDir: string
): string {
  const manifest = buildFileManifest(snapshot.globalConfig);
  const settingsContent = readStructuralFile(
    join(snapshot.globalConfig.absolutePath, 'settings.json')
  );

  return `
Generate structured change proposals for a Claude Code VPS configuration.
Run date: ${runDate}

=== CRITICAL PATH RULES (MUST FOLLOW — violations cause immediate test failure) ===
- For "modify" or "delete" actions: the path MUST appear verbatim in the "Existing files" section below.
- For "create" actions: the parent directory must exist OR be ~/.claude/plugins/ or ~/.claude/skills/.
- Do NOT invent or guess paths. If a path is not in "Existing files", it does not exist on this system.
- The settings file is ~/.claude/settings.json — NOT config.json, NOT .claude.json.
- Hooks are individual .sh files in ~/.claude/hooks/ — there is NO hooks.json file.
- The hooks registry is in ~/.claude/settings.json under the "hooks" key.
- CLAUDE.md files are plain markdown — do NOT treat them as JSON.
=== END PATH RULES ===

## Existing files in ~/.claude/ (use ONLY these paths for modify/delete)
${manifest}

## Current settings.json content (reference this for hook registration and config changes)
${settingsContent}

## Current config summary
- Skills: ${snapshot.globalConfig.counts.skills}
- Hooks: ${snapshot.globalConfig.counts.hooks}
- Agents: ${snapshot.globalConfig.counts.agents}
- Rules: ${snapshot.globalConfig.counts.rules}
- Commands: ${snapshot.globalConfig.counts.commands}

## Research recommendations (${intelligence.combinedRecommendations.length} total)
${JSON.stringify(intelligence.combinedRecommendations.slice(0, 10), null, 2)}

## Legacy findings (${legacyAnalysis.findings.length} total)
${JSON.stringify(legacyAnalysis.findings.slice(0, 5), null, 2)}

## Output format — return ONLY a JSON array, no other text

Each proposal must match this shape exactly:
{
  "id": "CCEE-${runDate.replace(/-/g, '')}-001",
  "title": "string",
  "category": "feature_adoption|config_update|skill_add|skill_update|skill_remove|hook_add|hook_update|hook_remove|agent_add|agent_replace|plugin_install|plugin_update|framework_integrate|legacy_removal|consolidation|security_patch|performance",
  "scope": "global",
  "priority": "P0_critical|P1_high|P2_medium|P3_low",
  "risk": "breaking|high|medium|low",
  "authorityType": "addition|modification|replacement|removal",
  "capabilityDelta": "what capability this adds, changes, or removes",
  "sourceRecommendations": [],
  "proposedChanges": [{"action": "create|modify|delete|rename", "path": "~/.claude/...", "content": "full file content for create", "diff": "unified diff for modify"}],
  "rollbackProcedure": {"backupPath": "~/.ccee/backups/${runDate}/", "restoreCommands": ["cp backup/file ~/.claude/file"]},
  "testing": {"validationCommand": "bash -c 'test -f ~/.claude/settings.json'", "expectedOutcome": "exit 0", "smokeTest": "claude --version"},
  "dependencies": [],
  "breakingChanges": false,
  "estimatedImpact": "concise impact description"
}

Output ONLY the JSON array. No markdown fences, no explanation.
`.trim();
}

// ---------------------------------------------------------------------------
// Helpers for prompt construction
// ---------------------------------------------------------------------------

/**
 * Build a compact file manifest string from a config directory.
 * Lists relative paths, one per line, capped at 200 entries to avoid prompt bloat.
 */
function buildFileManifest(dir: ConfigDirectory): string {
  if (!dir.exists || dir.files.length === 0) {
    return '(directory not found or empty)';
  }
  const MAX_ENTRIES = 200;
  const lines = dir.files
    .slice(0, MAX_ENTRIES)
    .map((f) => `~/.claude/${f.relativePath}`);
  if (dir.files.length > MAX_ENTRIES) {
    lines.push(`... (${dir.files.length - MAX_ENTRIES} more files omitted)`);
  }
  return lines.join('\n');
}

/**
 * Read a structural file and return its content, truncated at 3000 chars.
 * Returns '(file not found)' if missing.
 */
function readStructuralFile(absolutePath: string): string {
  try {
    const content = readFileSync(absolutePath, 'utf-8');
    return content.slice(0, 3000);
  } catch {
    return '(file not found)';
  }
}
