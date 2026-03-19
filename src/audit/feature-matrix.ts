/**
 * feature-matrix.ts — Compare current VPS state vs available Claude Code features.
 *
 * Reads feature-registry.json and determines which features are configured,
 * partially configured, or missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import type { ConfigSnapshot } from './config-snapshot.js';

const log = createTaggedLogger('feature-matrix');

export type FeatureStatus = 'available' | 'configured' | 'missing' | 'partial' | 'superseded';

export type FeatureEntry = {
  readonly name: string;
  readonly availableSince: string;
  readonly releaseDate: string;
  readonly status: string;
};

export type FeatureMatrixRow = {
  readonly feature: FeatureEntry;
  readonly vpsStatus: FeatureStatus;
  readonly gap: boolean;
  readonly notes: string;
};

export type FeatureMatrix = {
  readonly rows: readonly FeatureMatrixRow[];
  readonly totalFeatures: number;
  readonly configured: number;
  readonly missing: number;
  readonly partial: number;
  readonly superseded: number;
};

/**
 * Build a feature coverage matrix comparing the snapshot against the registry.
 */
export function buildFeatureMatrix(
  snapshot: ConfigSnapshot,
  featureRegistryPath: string
): FeatureMatrix {
  let features: FeatureEntry[] = [];

  try {
    const raw = readFileSync(featureRegistryPath, 'utf-8');
    const parsed = JSON.parse(raw) as { features?: FeatureEntry[] };
    features = parsed.features ?? [];
  } catch (err: unknown) {
    log.warn(`could not load feature registry: ${err instanceof Error ? err.message : String(err)}`);
  }

  const allFiles = [
    ...snapshot.globalConfig.files.map((f) => f.relativePath),
    ...snapshot.projectConfigs.flatMap((p) => p.files.map((f) => f.relativePath)),
  ];

  const allContent = allFiles
    .map((f) => f.toLowerCase())
    .join('\n');

  const rows: FeatureMatrixRow[] = features.map((feature) => {
    const row = assessFeature(feature, allContent, snapshot);
    return row;
  });

  const configured = rows.filter((r) => r.vpsStatus === 'configured').length;
  const missing = rows.filter((r) => r.vpsStatus === 'missing').length;
  const partial = rows.filter((r) => r.vpsStatus === 'partial').length;
  const superseded = rows.filter((r) => r.vpsStatus === 'superseded').length;

  log.info(
    `feature matrix: ${configured} configured, ${missing} missing, ${partial} partial, ${superseded} superseded`
  );

  return {
    rows,
    totalFeatures: features.length,
    configured,
    missing,
    partial,
    superseded,
  };
}

/**
 * Assess a single feature's presence in the current config.
 * TODO: Implement deep semantic assessment using SDK (Phase 2 full implementation).
 */
function assessFeature(
  feature: FeatureEntry,
  allContent: string,
  snapshot: ConfigSnapshot
): FeatureMatrixRow {
  const name = feature.name.toLowerCase();

  // Simple heuristic checks — full Phase 2 implementation uses SDK analysis
  if (name.includes('agent team') || name.includes('agent-team')) {
    const hasAgentTeam =
      allContent.includes('agent') &&
      existsSync(join(snapshot.globalConfig.absolutePath, 'agents'));
    return {
      feature,
      vpsStatus: hasAgentTeam ? 'partial' : 'missing',
      gap: !hasAgentTeam,
      notes: hasAgentTeam
        ? 'Individual agents exist but Agent Teams not explicitly configured'
        : 'Agent Teams feature not configured',
    };
  }

  if (name.includes('auto memory') || name.includes('memory')) {
    const hasCustomMemory = allContent.includes('memory');
    return {
      feature,
      vpsStatus: hasCustomMemory ? 'superseded' : 'missing',
      gap: true,
      notes: hasCustomMemory
        ? 'Custom memory implementation may be replaceable with native auto memory'
        : 'Memory feature not configured',
    };
  }

  // Default: unknown — mark as missing (conservative)
  return {
    feature,
    vpsStatus: 'missing',
    gap: true,
    notes: 'Requires manual assessment',
  };
}
