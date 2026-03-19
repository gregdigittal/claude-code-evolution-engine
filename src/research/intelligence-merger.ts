/**
 * intelligence-merger.ts — Merge all research sources into a unified report.
 *
 * Uses Claude Code SDK (Sonnet) to synthesise changelog entries, repo scans,
 * and YouTube intelligence into structured combined recommendations.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';
import type { ChangelogEntry } from './changelog-parser.js';
import type { RepoScanResult, DiscoveredRepo } from './github-scanner.js';
import type { VideoIntelligence } from './youtube-pipeline.js';

const log = createTaggedLogger('intelligence-merger');

export type Recommendation = {
  readonly id: string;
  readonly title: string;
  readonly source: readonly string[];
  readonly scope: 'global' | `project:${string}`;
  readonly impact: 'high' | 'medium' | 'low';
  readonly risk: 'high' | 'medium' | 'low';
  readonly category: string;
  readonly description: string;
  readonly implementationSteps: readonly string[];
};

export type IntelligenceReport = {
  readonly runDate: string;
  readonly sourcesScanned: number;
  readonly officialChanges: readonly ChangelogEntry[];
  readonly frameworkUpdates: readonly RepoScanResult[];
  readonly newReposDiscovered: readonly DiscoveredRepo[];
  readonly youtubeIntelligence: readonly VideoIntelligence[];
  readonly combinedRecommendations: readonly Recommendation[];
};

/**
 * Merge all research inputs into an intelligence report.
 * Uses Sonnet to synthesise combined recommendations.
 */
export async function mergeIntelligence(inputs: {
  officialChanges: ChangelogEntry[];
  frameworkUpdates: RepoScanResult[];
  newReposDiscovered: DiscoveredRepo[];
  youtubeIntelligence: VideoIntelligence[];
  runDate: string;
  outputDir: string;
}): Promise<IntelligenceReport> {
  const {
    officialChanges,
    frameworkUpdates,
    newReposDiscovered,
    youtubeIntelligence,
    runDate,
    outputDir,
  } = inputs;

  log.info('synthesising intelligence from all sources');

  const sourcesScanned =
    officialChanges.length +
    frameworkUpdates.length +
    newReposDiscovered.length +
    youtubeIntelligence.length;

  const prompt = buildSynthesisPrompt({
    officialChanges,
    frameworkUpdates,
    newReposDiscovered,
    youtubeIntelligence,
    runDate,
  });

  const result = await querySonnet({
    prompt,
    phaseName: 'intelligence-synthesis',
    systemPrompt:
      'You are the CCEE intelligence synthesiser. Output only valid JSON.',
  });

  let recommendations: Recommendation[] = [];

  if (result.success) {
    try {
      const jsonMatch = result.output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]) as Recommendation[];
      }
    } catch (err: unknown) {
      log.warn(`failed to parse synthesis output: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log.error(`intelligence synthesis failed: ${result.error ?? 'unknown'}`);
  }

  const report: IntelligenceReport = {
    runDate,
    sourcesScanned,
    officialChanges,
    frameworkUpdates,
    newReposDiscovered,
    youtubeIntelligence,
    combinedRecommendations: recommendations,
  };

  // Persist to run dir
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'intelligence-report.json'),
    JSON.stringify(report, null, 2),
    'utf-8'
  );
  log.info(`intelligence report saved to ${outputDir}`);

  return report;
}

function buildSynthesisPrompt(inputs: {
  officialChanges: ChangelogEntry[];
  frameworkUpdates: RepoScanResult[];
  newReposDiscovered: DiscoveredRepo[];
  youtubeIntelligence: VideoIntelligence[];
  runDate: string;
}): string {
  return `
You are analysing research data for the Claude Code Evolution Engine.
Run date: ${inputs.runDate}

Official changes (${inputs.officialChanges.length}):
${JSON.stringify(inputs.officialChanges.slice(0, 20), null, 2)}

Framework updates (${inputs.frameworkUpdates.filter((r) => r.changed).length} changed):
${JSON.stringify(
  inputs.frameworkUpdates
    .filter((r) => r.changed)
    .map((r) => ({ name: r.repo.name, sha: r.currentSha })),
  null,
  2
)}

Discovered repos (${inputs.newReposDiscovered.length}):
${JSON.stringify(inputs.newReposDiscovered.slice(0, 10), null, 2)}

YouTube intelligence (${inputs.youtubeIntelligence.length} videos):
${JSON.stringify(
  inputs.youtubeIntelligence.map((v) => ({
    title: v.title,
    takeaways: v.takeaways,
    configChanges: v.configChanges,
  })),
  null,
  2
)}

Generate a JSON array of combined recommendations. Each item must have:
{
  "id": "REC-001",
  "title": "string",
  "source": ["source-ref", ...],
  "scope": "global" | "project:name",
  "impact": "high" | "medium" | "low",
  "risk": "high" | "medium" | "low",
  "category": "feature_adoption|config_update|skill_add|...",
  "description": "string",
  "implementationSteps": ["step", ...]
}

Output ONLY the JSON array.
`.trim();
}
