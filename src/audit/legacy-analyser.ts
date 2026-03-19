/**
 * legacy-analyser.ts — Full authority analysis of superseded, redundant, and dead config.
 *
 * CCEE has full restructuring authority. This module identifies:
 * - Superseded implementations (custom systems replaced by official features)
 * - Over-engineered patterns (complexity without proportional value)
 * - Scope pollution (global configs that should be project-scoped)
 * - Dead config (files never triggered or loaded)
 */

import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import type { ConfigSnapshot } from './config-snapshot.js';

const log = createTaggedLogger('legacy-analyser');

export type LegacyFinding = {
  readonly type:
    | 'superseded'
    | 'over-engineered'
    | 'scope-pollution'
    | 'dead-config'
    | 'redundant';
  readonly severity: 'high' | 'medium' | 'low';
  readonly files: readonly string[];
  readonly description: string;
  readonly replacedBy?: string;
  readonly capabilityDelta: string;
  readonly riskIfRemoved: 'breaking' | 'high' | 'medium' | 'low';
};

export type LegacyAnalysis = {
  readonly findings: readonly LegacyFinding[];
  readonly totalFiles: number;
  readonly potentiallyRemovable: number;
  readonly highRiskRemovals: number;
};

/**
 * Analyse config for legacy, redundant, and dead patterns.
 */
export async function analyseLegacy(
  snapshot: ConfigSnapshot
): Promise<LegacyAnalysis> {
  log.info('running legacy analysis (full authority scan)');

  const fileList = snapshot.globalConfig.files.map((f) => f.relativePath);

  const prompt = buildLegacyAnalysisPrompt(fileList, snapshot);
  const result = await querySonnet({ prompt, phaseName: 'legacy-analysis' });

  let findings: LegacyFinding[] = [];

  if (result.success) {
    try {
      const jsonMatch = result.output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        findings = JSON.parse(jsonMatch[0]) as LegacyFinding[];
      }
    } catch {
      log.warn('failed to parse legacy analysis output');
    }
  } else {
    log.error(`legacy analysis failed: ${result.error ?? 'unknown'}`);
    // Fall back to heuristic detection
    findings = heuristicLegacyDetection(snapshot);
  }

  const potentiallyRemovable = findings.filter(
    (f) => f.riskIfRemoved !== 'breaking'
  ).length;
  const highRiskRemovals = findings.filter(
    (f) => f.riskIfRemoved === 'breaking' || f.riskIfRemoved === 'high'
  ).length;

  log.info(
    `legacy findings: ${findings.length} total, ${potentiallyRemovable} removable, ` +
      `${highRiskRemovals} high-risk`
  );

  return {
    findings,
    totalFiles: snapshot.globalConfig.counts.total,
    potentiallyRemovable,
    highRiskRemovals,
  };
}

function buildLegacyAnalysisPrompt(
  fileList: string[],
  snapshot: ConfigSnapshot
): string {
  return `
Analyse this Claude Code configuration for legacy, redundant, and dead patterns.

Files in ~/.claude/:
${fileList.join('\n')}

Config counts:
- Skills: ${snapshot.globalConfig.counts.skills}
- Hooks: ${snapshot.globalConfig.counts.hooks}
- Agents: ${snapshot.globalConfig.counts.agents}
- Rules: ${snapshot.globalConfig.counts.rules}

Known superseded patterns to look for:
1. Custom memory persistence hooks → replaced by native auto memory
2. Custom persona switching → replaced by agent frontmatter
3. Custom context bus → replaced by Agent Teams + SendMessage
4. External scheduling triggers → replaced by Claude Code scheduled tasks
5. Custom skill registries → replaced by Plugin Marketplace

For each finding, output JSON:
[
  {
    "type": "superseded|over-engineered|scope-pollution|dead-config|redundant",
    "severity": "high|medium|low",
    "files": ["path", ...],
    "description": "what is wrong",
    "replacedBy": "what replaces it (if applicable)",
    "capabilityDelta": "what capability is lost (if any)",
    "riskIfRemoved": "breaking|high|medium|low"
  }
]

Output ONLY the JSON array.
`.trim();
}

/**
 * Heuristic fallback when SDK analysis fails.
 */
function heuristicLegacyDetection(
  snapshot: ConfigSnapshot
): LegacyFinding[] {
  const findings: LegacyFinding[] = [];
  const files = snapshot.globalConfig.files.map((f) => f.relativePath);

  // Check for potential memory hook duplication
  const memoryHooks = files.filter(
    (f) => f.includes('memory') && f.includes('hook')
  );
  if (memoryHooks.length > 0) {
    findings.push({
      type: 'superseded',
      severity: 'medium',
      files: memoryHooks,
      description: 'Custom memory hooks may be superseded by native auto memory',
      replacedBy: 'Claude Code native autoMemoryDirectory setting',
      capabilityDelta: 'None expected — native auto memory includes timestamps and staleness detection',
      riskIfRemoved: 'medium',
    });
  }

  return findings;
}
