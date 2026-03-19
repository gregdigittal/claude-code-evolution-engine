/**
 * scope-classifier.ts — Classify config changes as global vs project-scoped.
 *
 * Every proposed change gets a hard scope tag:
 *   global           → ~/.claude/
 *   project:{name}   → ~/{project}/.claude/
 *   global+project   → Requires coordinated update
 */

import { createTaggedLogger } from '../utils/logger.js';
import type { ConfigSnapshot } from './config-snapshot.js';

const log = createTaggedLogger('scope-classifier');

export type ChangeScope =
  | 'global'
  | `project:${string}`
  | 'global+project';

export type ScopeRule = {
  readonly pattern: RegExp | string;
  readonly scope: ChangeScope;
  readonly rationale: string;
};

// Rules for classifying scope — ordered by precedence (first match wins)
const SCOPE_RULES: ScopeRule[] = [
  {
    pattern: /stack[-_]?(specific|laravel|php|python|fastapi|next|react)/i,
    scope: 'project:ccrs',
    rationale: 'Stack-specific configs belong in the project that uses that stack',
  },
  {
    pattern: /security[-_]review|vulnerability/i,
    scope: 'global',
    rationale: 'Security practices apply universally',
  },
  {
    pattern: /agent[-_]team|sub[-_]agent|parallel/i,
    scope: 'global',
    rationale: 'Agent orchestration patterns are universal',
  },
  {
    pattern: /memory|auto[-_]memory/i,
    scope: 'global',
    rationale: 'Memory systems are global infrastructure',
  },
  {
    pattern: /hook/i,
    scope: 'global',
    rationale: 'Hooks fire across all projects',
  },
  {
    pattern: /mcp[-_]server|plugin/i,
    scope: 'global',
    rationale: 'MCP servers and plugins are registered globally',
  },
];

/**
 * Classify a change proposal's scope based on its title and description.
 */
export function classifyScope(
  title: string,
  description: string
): ChangeScope {
  const combined = `${title} ${description}`.toLowerCase();

  for (const rule of SCOPE_RULES) {
    const matches =
      rule.pattern instanceof RegExp
        ? rule.pattern.test(combined)
        : combined.includes(rule.pattern.toLowerCase());

    if (matches) {
      log.debug(`scope match: "${title}" → ${rule.scope} (${rule.rationale})`);
      return rule.scope;
    }
  }

  // Default to global for unclassified changes
  return 'global';
}

/**
 * Detect scope pollution — global configs that should be project-scoped.
 */
export function detectScopePollution(
  snapshot: ConfigSnapshot
): Array<{ file: string; reason: string; suggestedScope: ChangeScope }> {
  const issues: Array<{ file: string; reason: string; suggestedScope: ChangeScope }> = [];

  const projectStackKeywords: Record<string, string[]> = {
    'project:ccrs': ['laravel', 'filament', 'php', 'eloquent', 'artisan'],
    'project:virtual-analyst': ['fastapi', 'supabase', 'nextjs', 'next.js'],
    'project:mission-control': ['mission-control', 'tailscale'],
    'project:social-media-agent': ['slack', 'slack-bolt', 'instagram', 'linkedin'],
  };

  for (const file of snapshot.globalConfig.files) {
    const path = file.relativePath.toLowerCase();

    for (const [scope, keywords] of Object.entries(projectStackKeywords)) {
      if (keywords.some((kw) => path.includes(kw))) {
        issues.push({
          file: file.relativePath,
          reason: `Contains "${scope}" stack-specific keywords but is in global config`,
          suggestedScope: scope as ChangeScope,
        });
        break;
      }
    }
  }

  if (issues.length > 0) {
    log.warn(`scope pollution: ${issues.length} potential violations detected`);
  }

  return issues;
}
