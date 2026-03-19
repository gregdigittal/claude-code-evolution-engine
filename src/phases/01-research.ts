/**
 * Phase 1 — Deep Research Sweep
 *
 * Fetches official changelogs, scans tracked repos, runs YouTube pipeline,
 * and synthesises all inputs into an intelligence report.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { fetchOfficialChangelog, fetchGithubReleases } from '../research/changelog-parser.js';
import { scanTrackedRepo, discoverNewRepos } from '../research/github-scanner.js';
import { fetchTranscript, extractIntelligence } from '../research/youtube-pipeline.js';
import { mergeIntelligence } from '../research/intelligence-merger.js';
import { readTrackedRepos, readTrackedChannels } from '../obsidian/config-reader.js';
import type { Config } from '../config.js';

const log = createTaggedLogger('phase-1-research');

export async function runResearchPhase(
  config: Config,
  runDate: string,
  lastRunDate: Date
): Promise<ReturnType<typeof mergeIntelligence>> {
  const runDir = join(config.runDir, runDate);
  mkdirSync(runDir, { recursive: true });

  log.info('=== PHASE 1: DEEP RESEARCH SWEEP ===');

  // 1A. Official sources
  log.info('1A: fetching official changelogs');
  const [officialChanges, githubReleases] = await Promise.allSettled([
    fetchOfficialChangelog(lastRunDate),
    fetchGithubReleases(lastRunDate, config.githubToken),
  ]);

  const allOfficialChanges = [
    ...(officialChanges.status === 'fulfilled' ? officialChanges.value : []),
    ...(githubReleases.status === 'fulfilled' ? githubReleases.value : []),
  ];
  log.info(`official changes found: ${allOfficialChanges.length}`);

  // 1B. Community frameworks
  log.info('1B: scanning community repos');
  const trackedRepos = readTrackedRepos(
    config.obsidianStagingPath,
    join(process.cwd(), 'data', 'default-repos.json')
  );

  const repoScanResults = await Promise.allSettled(
    trackedRepos.map((repo) =>
      scanTrackedRepo(repo, config.cacheDir)
    )
  );

  const frameworkUpdates = repoScanResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scanTrackedRepo>>> =>
      r.status === 'fulfilled'
    )
    .map((r) => r.value);

  const changedRepos = frameworkUpdates.filter((r) => r.changed).length;
  log.info(`repos scanned: ${frameworkUpdates.length}, changed: ${changedRepos}`);

  // Discover new repos
  const newReposDiscovered = await discoverNewRepos(config.githubToken);
  log.info(`new repos discovered: ${newReposDiscovered.length}`);

  // 1C. YouTube intelligence
  log.info('1C: processing YouTube intelligence');
  const trackedChannels = readTrackedChannels(
    config.obsidianStagingPath,
    join(process.cwd(), 'data', 'default-channels.json')
  );
  log.info(`tracked channels: ${trackedChannels.length} (transcript processing TODO: implement video search)`);
  // TODO: Implement YouTube video search and transcript processing
  const youtubeIntelligence: Awaited<ReturnType<typeof extractIntelligence>>[] = [];

  // 1D. Intelligence synthesis
  log.info('1D: synthesising intelligence');
  const report = await mergeIntelligence({
    officialChanges: allOfficialChanges,
    frameworkUpdates,
    newReposDiscovered,
    youtubeIntelligence: youtubeIntelligence.filter(
      (v): v is NonNullable<typeof v> => v !== null
    ),
    runDate,
    outputDir: runDir,
  });

  log.info('=== PHASE 1 COMPLETE ===');
  return report;
}
