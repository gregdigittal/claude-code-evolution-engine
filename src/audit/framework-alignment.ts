/**
 * framework-alignment.ts — Compare VPS config against GSD and BMAD frameworks.
 *
 * Assesses alignment with GSD v2 patterns (fresh-context, wave-parallelism,
 * Nyquist validation) and BMAD patterns (role-based agents, 4-phase workflow).
 */

import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import type { ConfigSnapshot } from './config-snapshot.js';
import type { RepoScanResult } from '../research/github-scanner.js';

const log = createTaggedLogger('framework-alignment');

export type AlignmentScore = 'strong' | 'partial' | 'weak' | 'not-aligned';

export type FrameworkAssessment = {
  readonly framework: 'GSD' | 'BMAD' | 'hybrid';
  readonly overall: AlignmentScore;
  readonly patterns: readonly PatternAlignment[];
  readonly gaps: readonly string[];
  readonly recommendations: readonly string[];
};

export type PatternAlignment = {
  readonly pattern: string;
  readonly status: AlignmentScore;
  readonly evidence: string;
};

const GSD_PATTERNS = [
  'fresh-context execution',
  'wave-based parallelism',
  'Nyquist validation',
  'externalized state',
  'atomic commits',
  'sub-agent orchestration',
];

const BMAD_PATTERNS = [
  'role-based agents',
  '4-phase workflow',
  'scale-adaptive intelligence',
  'expansion packs',
  'agile AI workflow',
];

/**
 * Analyse VPS config alignment with tracked frameworks using SDK.
 */
export async function assessFrameworkAlignment(
  snapshot: ConfigSnapshot,
  frameworkRepos: RepoScanResult[]
): Promise<FrameworkAssessment[]> {
  log.info('assessing framework alignment');

  // Collect config file contents for analysis
  const configSummary = buildConfigSummary(snapshot);

  const gsdRepo = frameworkRepos.find(
    (r) => r.repo.name.toLowerCase().includes('gsd')
  );
  const bmadRepo = frameworkRepos.find(
    (r) => r.repo.name.toLowerCase().includes('bmad')
  );

  const gsdAssessment = await assessSingleFramework(
    'GSD',
    GSD_PATTERNS,
    configSummary
  );

  const bmadAssessment = await assessSingleFramework(
    'BMAD',
    BMAD_PATTERNS,
    configSummary
  );

  return [gsdAssessment, bmadAssessment];
}

async function assessSingleFramework(
  framework: 'GSD' | 'BMAD',
  patterns: string[],
  configSummary: string
): Promise<FrameworkAssessment> {
  const prompt = `
Assess how well this Claude Code configuration aligns with ${framework} framework patterns.

Patterns to check:
${patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Current config summary:
${configSummary.slice(0, 3000)}

Respond with JSON:
{
  "overall": "strong|partial|weak|not-aligned",
  "patterns": [
    { "pattern": "name", "status": "strong|partial|weak|not-aligned", "evidence": "brief note" }
  ],
  "gaps": ["gap description", ...],
  "recommendations": ["actionable recommendation", ...]
}
`.trim();

  const result = await querySonnet({ prompt, phaseName: 'framework-alignment' });

  if (!result.success) {
    log.warn(`framework alignment assessment failed for ${framework}`);
    return {
      framework,
      overall: 'weak',
      patterns: patterns.map((p) => ({
        pattern: p,
        status: 'not-aligned' as AlignmentScore,
        evidence: 'Assessment failed',
      })),
      gaps: ['Assessment failed'],
      recommendations: [],
    };
  }

  try {
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]) as {
      overall?: AlignmentScore;
      patterns?: PatternAlignment[];
      gaps?: string[];
      recommendations?: string[];
    };
    return {
      framework,
      overall: parsed.overall ?? 'weak',
      patterns: parsed.patterns ?? [],
      gaps: parsed.gaps ?? [],
      recommendations: parsed.recommendations ?? [],
    };
  } catch {
    return {
      framework,
      overall: 'weak',
      patterns: [],
      gaps: ['Failed to parse assessment output'],
      recommendations: [],
    };
  }
}

function buildConfigSummary(snapshot: ConfigSnapshot): string {
  const lines: string[] = [
    `Global config: ${snapshot.globalConfig.counts.total} files`,
    `  Skills: ${snapshot.globalConfig.counts.skills}`,
    `  Hooks: ${snapshot.globalConfig.counts.hooks}`,
    `  Agents: ${snapshot.globalConfig.counts.agents}`,
    `  Rules: ${snapshot.globalConfig.counts.rules}`,
    '',
    'File listing:',
    ...snapshot.globalConfig.files.map((f) => `  ${f.relativePath}`),
  ];
  return lines.join('\n');
}
