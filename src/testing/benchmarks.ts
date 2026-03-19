/**
 * benchmarks.ts — Comparative benchmarks: current config vs proposed config.
 *
 * Measures: skills loaded, hook count, context token consumption, latency proxies.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import type { ConfigSnapshot } from '../audit/config-snapshot.js';
import type { SandboxPaths } from './sandbox.js';

const log = createTaggedLogger('benchmarks');

export type BenchmarkMetrics = {
  readonly skillCount: number;
  readonly hookCount: number;
  readonly agentCount: number;
  readonly ruleCount: number;
  readonly totalFiles: number;
  readonly estimatedContextTokens: number;
};

export type BenchmarkComparison = {
  readonly before: BenchmarkMetrics;
  readonly after: BenchmarkMetrics;
  readonly delta: {
    readonly skillCount: number;
    readonly hookCount: number;
    readonly agentCount: number;
    readonly ruleCount: number;
    readonly totalFiles: number;
    readonly estimatedContextTokens: number;
  };
};

/**
 * Estimate context tokens from file count and sizes.
 * Very rough: ~250 tokens per KB of config.
 */
function estimateContextTokens(snapshot: ConfigSnapshot | null): number {
  if (!snapshot) return 0;
  const totalBytes = snapshot.globalConfig.files.reduce(
    (sum, f) => sum + f.sizeBytes,
    0
  );
  return Math.round((totalBytes / 1024) * 250);
}

/**
 * Collect metrics from the current config snapshot.
 */
export function measureCurrent(snapshot: ConfigSnapshot): BenchmarkMetrics {
  return {
    skillCount: snapshot.globalConfig.counts.skills,
    hookCount: snapshot.globalConfig.counts.hooks,
    agentCount: snapshot.globalConfig.counts.agents,
    ruleCount: snapshot.globalConfig.counts.rules,
    totalFiles: snapshot.globalConfig.counts.total,
    estimatedContextTokens: estimateContextTokens(snapshot),
  };
}

/**
 * Collect metrics from the sandbox (post-apply simulation).
 */
export function measureSandbox(sandbox: SandboxPaths): BenchmarkMetrics {
  const countDir = (subdir: string) => {
    const dir = join(sandbox.globalClaudeDir, subdir);
    if (!existsSync(dir)) return 0;
    try {
      return readdirSync(dir, { recursive: true })
        .filter((f): f is string => typeof f === 'string')
        .filter((f) => !f.startsWith('.'))
        .length;
    } catch {
      return 0;
    }
  };

  const totalFiles = (() => {
    try {
      return (readdirSync(sandbox.globalClaudeDir, { recursive: true }) as string[]).length;
    } catch {
      return 0;
    }
  })();

  return {
    skillCount: countDir('skills'),
    hookCount: countDir('hooks'),
    agentCount: countDir('agents'),
    ruleCount: countDir('rules'),
    totalFiles,
    estimatedContextTokens: totalFiles * 30, // rough proxy
  };
}

/**
 * Compare before and after metrics.
 */
export function compareMetrics(
  before: BenchmarkMetrics,
  after: BenchmarkMetrics
): BenchmarkComparison {
  const delta = {
    skillCount: after.skillCount - before.skillCount,
    hookCount: after.hookCount - before.hookCount,
    agentCount: after.agentCount - before.agentCount,
    ruleCount: after.ruleCount - before.ruleCount,
    totalFiles: after.totalFiles - before.totalFiles,
    estimatedContextTokens:
      after.estimatedContextTokens - before.estimatedContextTokens,
  };

  log.info(
    `benchmark delta: skills ${delta.skillCount > 0 ? '+' : ''}${delta.skillCount}, ` +
      `hooks ${delta.hookCount > 0 ? '+' : ''}${delta.hookCount}, ` +
      `context ${delta.estimatedContextTokens > 0 ? '+' : ''}${delta.estimatedContextTokens} tokens`
  );

  return { before, after, delta };
}
