#!/usr/bin/env tsx
/**
 * retest-proposals.ts — Re-run Phase 4 testing against existing proposals.
 *
 * Usage: npx tsx scripts/retest-proposals.ts [run-date]
 * Default run-date: today (YYYY-MM-DD)
 *
 * Does NOT re-run Phases 1-3. Just re-tests existing proposals.json
 * and writes a fresh test-results.json.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { validateProposals } from '../src/testing/validator.js';
import { createTaggedLogger } from '../src/utils/logger.js';
import type { Proposal } from '../src/proposals/generator.js';

const log = createTaggedLogger('retest');

const runDate = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const runDir = join(homedir(), '.ccee', 'runs', runDate);
const sandboxBaseDir = join(homedir(), '.ccee', 'test-env', runDate, 'sandbox');

log.info(`Re-running Phase 4 for run date: ${runDate}`);
log.info(`Run dir: ${runDir}`);

const proposalsPath = join(runDir, 'proposals.json');
if (!existsSync(proposalsPath)) {
  log.error(`proposals.json not found at ${proposalsPath}`);
  process.exit(1);
}

const proposals = JSON.parse(readFileSync(proposalsPath, 'utf-8')) as Proposal[];
log.info(`Loaded ${proposals.length} proposals`);

const testResults = await validateProposals(proposals, sandboxBaseDir, homedir(), runDate);

const outputPath = join(runDir, 'test-results.json');
writeFileSync(outputPath, JSON.stringify(testResults, null, 2), 'utf-8');

log.info(`Test results written to ${outputPath}`);
log.info(`Results: ${testResults.tier1Passed}/${testResults.proposalsTested} passed Tier 1`);
log.info(`  Tier 2: ${testResults.tier2Passed}/${testResults.tier2Tested} passed`);
log.info(`  Tier 3: ${testResults.tier3Passed}/${testResults.tier3Tested} passed`);
