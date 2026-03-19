/**
 * svg-generator.ts — Generate SVG architecture diagrams via Claude Code SDK (Opus).
 *
 * Uses the Mission Control design tokens for all generated diagrams.
 * Diagram types: full architecture, global config map, project config map, before/after diff.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { queryOpus } from '../sdk.js';
import type { ConfigSnapshot } from '../audit/config-snapshot.js';

const log = createTaggedLogger('svg-generator');

export type DiagramType =
  | 'full-architecture'
  | 'global-config-map'
  | 'project-config-map'
  | 'before-after';

const SVG_SYSTEM_PROMPT = `
You are an SVG architecture diagram generator. Follow Mission Control design tokens exactly:
- Canvas: 1200x800px, background #06080c
- Panels: rounded rectangles, fill #0b0e14, stroke #1c2232, stroke-width 1
- Active/primary elements: #22d3ee (cyan) with glow filter
- Text: #e2e8f0 for labels, #94a3b8 for secondary
- Connections: curved paths with arrowheads, #1c2232 default, #22d3ee for active
- Font: "DM Sans" for labels, "JetBrains Mono" for paths/code
- Legend: bottom-right corner
Output ONLY valid SVG code. No markdown, no explanation.
`.trim();

/**
 * Generate a full architecture SVG from a config snapshot.
 */
export async function generateArchitectureDiagram(
  snapshot: ConfigSnapshot,
  outputPath: string
): Promise<string | null> {
  log.info('generating full architecture SVG (Opus)');

  const prompt = buildArchitecturePrompt(snapshot);
  const result = await queryOpus({
    prompt,
    systemPrompt: SVG_SYSTEM_PROMPT,
    phaseName: 'svg-architecture',
  });

  if (!result.success) {
    log.error(`SVG generation failed: ${result.error ?? 'unknown'}`);
    return null;
  }

  const svgMatch = result.output.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    log.warn('No SVG found in Opus output');
    return null;
  }

  const svg = svgMatch[0];
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, svg, 'utf-8');
  log.info(`SVG written to ${outputPath}`);

  return svg;
}

/**
 * Generate a before/after diff SVG.
 */
export async function generateBeforeAfterDiagram(
  before: ConfigSnapshot,
  after: ConfigSnapshot,
  outputPath: string
): Promise<string | null> {
  log.info('generating before/after SVG (Opus)');

  const prompt = `
Create a side-by-side before/after architecture diagram.

BEFORE (left panel):
Skills: ${before.globalConfig.counts.skills}, Hooks: ${before.globalConfig.counts.hooks}, Agents: ${before.globalConfig.counts.agents}
Files: ${before.globalConfig.files.map((f) => f.relativePath).slice(0, 20).join(', ')}

AFTER (right panel):
Skills: ${after.globalConfig.counts.skills}, Hooks: ${after.globalConfig.counts.hooks}, Agents: ${after.globalConfig.counts.agents}
Files: ${after.globalConfig.files.map((f) => f.relativePath).slice(0, 20).join(', ')}

Changed elements in cyan, removed elements in red (#f87171), added elements in green (#34d399).
`.trim();

  const result = await queryOpus({
    prompt,
    systemPrompt: SVG_SYSTEM_PROMPT,
    phaseName: 'svg-before-after',
  });

  if (!result.success) {
    log.error(`before/after SVG failed: ${result.error ?? 'unknown'}`);
    return null;
  }

  const svgMatch = result.output.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) return null;

  const svg = svgMatch[0];
  writeFileSync(outputPath, svg, 'utf-8');
  return svg;
}

function buildArchitecturePrompt(snapshot: ConfigSnapshot): string {
  return `
Generate a full architecture diagram for this Claude Code VPS configuration.

Global config (~/.claude/):
- Skills: ${snapshot.globalConfig.counts.skills}
- Hooks: ${snapshot.globalConfig.counts.hooks}
- Agents: ${snapshot.globalConfig.counts.agents}
- Rules: ${snapshot.globalConfig.counts.rules}
- Total files: ${snapshot.globalConfig.counts.total}

Key files:
${snapshot.globalConfig.files.slice(0, 30).map((f) => `- ${f.relativePath}`).join('\n')}

Projects with .claude/ configs:
${snapshot.projectConfigs
  .filter((p) => p.exists)
  .map((p) => `- ${p.label}: ${p.counts.total} files`)
  .join('\n')}

Show: global config box connected to project boxes. Skills/hooks/agents as labelled nodes.
Include a VPS box containing all elements.
`.trim();
}
