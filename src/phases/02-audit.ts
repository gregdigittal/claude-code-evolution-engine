/**
 * Phase 2 — VPS Configuration Audit
 *
 * Captures config snapshot, builds feature matrix, detects legacy patterns,
 * assesses framework alignment, and classifies scope.
 */

import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { captureSnapshot } from '../audit/config-snapshot.js';
import { buildFeatureMatrix } from '../audit/feature-matrix.js';
import { assessFrameworkAlignment } from '../audit/framework-alignment.js';
import { analyseLegacy } from '../audit/legacy-analyser.js';
import { detectScopePollution } from '../audit/scope-classifier.js';
import type { Config } from '../config.js';
import type { IntelligenceReport } from '../research/intelligence-merger.js';

const log = createTaggedLogger('phase-2-audit');

export type AuditResult = {
  readonly snapshot: Awaited<ReturnType<typeof captureSnapshot>>;
  readonly featureMatrix: Awaited<ReturnType<typeof buildFeatureMatrix>>;
  readonly legacyAnalysis: Awaited<ReturnType<typeof analyseLegacy>>;
  readonly frameworkAssessments: Awaited<ReturnType<typeof assessFrameworkAlignment>>;
  readonly scopeIssues: ReturnType<typeof detectScopePollution>;
};

export async function runAuditPhase(
  config: Config,
  runDate: string,
  intelligence: IntelligenceReport
): Promise<AuditResult> {
  const runDir = join(config.runDir, runDate);
  log.info('=== PHASE 2: VPS CONFIGURATION AUDIT ===');

  // 2A. Config snapshot
  log.info('2A: capturing config snapshot');
  const snapshot = captureSnapshot(runDir);

  // 2B. Feature matrix
  log.info('2B: building feature coverage matrix');
  const featureRegistryPath = join(process.cwd(), 'data', 'feature-registry.json');
  const featureMatrix = buildFeatureMatrix(snapshot, featureRegistryPath);
  log.info(
    `feature matrix: ${featureMatrix.missing} missing, ${featureMatrix.partial} partial, ` +
      `${featureMatrix.superseded} superseded`
  );

  // 2C. Legacy analysis
  log.info('2C: running legacy & redundancy analysis');
  const legacyAnalysis = await analyseLegacy(snapshot);

  // 2D. Framework alignment
  log.info('2D: assessing framework alignment (GSD + BMAD)');
  const frameworkAssessments = await assessFrameworkAlignment(
    snapshot,
    intelligence.frameworkUpdates as unknown as import('../research/github-scanner.js').RepoScanResult[]
  );

  // 2E. Scope classification
  log.info('2E: detecting scope pollution');
  const scopeIssues = detectScopePollution(snapshot);
  if (scopeIssues.length > 0) {
    log.warn(`scope pollution: ${scopeIssues.length} potential issues`);
  }

  log.info('=== PHASE 2 COMPLETE ===');

  return {
    snapshot,
    featureMatrix,
    legacyAnalysis,
    frameworkAssessments,
    scopeIssues,
  };
}
