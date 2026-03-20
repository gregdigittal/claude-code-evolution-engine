/**
 * github-scanner.ts — Scan GitHub for tracked and newly discovered repos.
 *
 * Fetches repo metadata, diffs against cached state, and runs discovery
 * queries for new Claude Code-related repos.
 */

import axios from 'axios';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureShallowClone, getHeadSha } from '../utils/git.js';
import { hashObject } from '../utils/hash.js';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('github-scanner');

export type TrackedRepo = {
  readonly name: string;
  readonly url: string;
  readonly extractPatterns: readonly string[];
};

export type RepoScanResult = {
  readonly repo: TrackedRepo;
  readonly currentSha: string | null;
  readonly previousSha: string | null;
  readonly changed: boolean;
  readonly localPath: string;
  readonly filesChanged: readonly string[];
  readonly unavailable?: boolean;
};

export type DiscoveredRepo = {
  readonly name: string;
  readonly url: string;
  readonly stars: number;
  readonly description: string;
  readonly updatedAt: string;
};

const DISCOVERY_QUERIES = [
  'claude code plugin',
  'claude code skills',
  'claude code hooks',
  'claude code agents',
  'claude code framework',
  'claude code workflow',
];

/**
 * Scan a tracked repo — clone or fetch, compare against cached SHA.
 */
export async function scanTrackedRepo(
  repo: TrackedRepo,
  cacheDir: string
): Promise<RepoScanResult> {
  const repoSlug = repo.url
    .replace(/^https?:\/\//, '')
    .replace(/\//g, '__');
  const localPath = join(cacheDir, repoSlug);
  const stateFile = join(cacheDir, `${repoSlug}.sha`);

  const previousSha = existsSync(stateFile)
    ? readFileSync(stateFile, 'utf-8').trim()
    : null;

  await ensureShallowClone(repo.url, localPath);

  if (!existsSync(join(localPath, '.git'))) {
    log.warn(`shallow clone failed or missing .git for ${repo.url} — marking unavailable`);
    return {
      repo,
      currentSha: null,
      previousSha,
      changed: false,
      localPath,
      filesChanged: [],
      unavailable: true,
    };
  }

  const currentSha = getHeadSha(localPath);

  if (currentSha) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(stateFile, currentSha, 'utf-8');
  }

  const changed = currentSha !== previousSha && previousSha !== null;
  // TODO: Populate filesChanged from git diff when changed
  const filesChanged: string[] = [];

  return {
    repo,
    currentSha,
    previousSha,
    changed,
    localPath,
    filesChanged,
  };
}

/**
 * Discover new repos matching Claude Code-related queries.
 * Returns repos with >10 stars updated in the last 7 days.
 */
export async function discoverNewRepos(
  githubToken: string
): Promise<DiscoveredRepo[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const discovered: DiscoveredRepo[] = [];
  const seen = new Set<string>();

  for (const query of DISCOVERY_QUERIES) {
    try {
      const response = await axios.get<GithubSearchResponse>(
        'https://api.github.com/search/repositories',
        {
          params: {
            q: `${query} pushed:>${sevenDaysAgo} stars:>10`,
            sort: 'stars',
            order: 'desc',
            per_page: 10,
          },
          timeout: 30_000,
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'CCEE/0.1.0',
          },
        }
      );

      for (const item of response.data.items) {
        if (!seen.has(item.full_name)) {
          seen.add(item.full_name);
          discovered.push({
            name: item.full_name,
            url: `https://github.com/${item.full_name}`,
            stars: item.stargazers_count,
            description: item.description || '',
            updatedAt: item.updated_at,
          });
        }
      }

      // Rate-limit: 1 request per second to stay within GitHub API limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`discovery query "${query}" failed: ${message}`);
    }
  }

  return discovered;
}

type GithubSearchResponse = {
  items: Array<{
    full_name: string;
    description: string;
    stargazers_count: number;
    updated_at: string;
  }>;
};
