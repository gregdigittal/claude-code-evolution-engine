/**
 * generator.ts — Generate structured change proposals from intelligence + audit data.
 *
 * Each proposal is self-contained with rollback procedures and testing commands.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import type { IntelligenceReport } from '../research/intelligence-merger.js';
import type { ConfigSnapshot } from '../audit/config-snapshot.js';
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

  const prompt = buildProposalPrompt(intelligence, snapshot, legacyAnalysis, runDate);
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
        log.info(`generated ${proposals.length} proposals`);
      }
    } catch (err: unknown) {
      log.warn(`failed to parse proposals: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log.error(`proposal generation failed: ${result.error ?? 'unknown'}`);
  }

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

function buildProposalPrompt(
  intelligence: IntelligenceReport,
  snapshot: ConfigSnapshot,
  legacyAnalysis: LegacyAnalysis,
  runDate: string
): string {
  return `
Generate structured change proposals for a Claude Code VPS configuration.
Run date: ${runDate}

Combined recommendations from research (${intelligence.combinedRecommendations.length}):
${JSON.stringify(intelligence.combinedRecommendations.slice(0, 10), null, 2)}

Legacy findings (${legacyAnalysis.findings.length}):
${JSON.stringify(legacyAnalysis.findings.slice(0, 5), null, 2)}

Current config:
- Global skills: ${snapshot.globalConfig.counts.skills}
- Global hooks: ${snapshot.globalConfig.counts.hooks}
- Global agents: ${snapshot.globalConfig.counts.agents}

For each proposal output:
{
  "id": "CCEE-${runDate.replace(/-/g, '')}-001",
  "title": "string",
  "category": "feature_adoption|config_update|...",
  "scope": "global|project:name",
  "priority": "P0_critical|P1_high|P2_medium|P3_low",
  "risk": "breaking|high|medium|low",
  "authorityType": "addition|modification|replacement|removal",
  "capabilityDelta": "what capability changes",
  "sourceRecommendations": ["REC-001"],
  "proposedChanges": [{"action": "create|modify|delete|rename", "path": "path", "diff": "optional diff"}],
  "rollbackProcedure": {"backupPath": "~/.ccee/backups/${runDate}/", "restoreCommands": ["cmd"]},
  "testing": {"validationCommand": "cmd", "expectedOutcome": "what to verify", "smokeTest": "optional"},
  "dependencies": [],
  "breakingChanges": false,
  "estimatedImpact": "brief impact description"
}

Output ONLY the JSON array.
`.trim();
}
