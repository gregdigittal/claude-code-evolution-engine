/**
 * config-reader.ts — Read tracked repos and channels from Obsidian staging notes.
 *
 * Parses the operator-managed markdown files in CCEE/Repo-Intelligence/ and
 * CCEE/YouTube-Intelligence/ to get the current tracking lists.
 *
 * Repo sources (merged in priority order, deduplicated by URL):
 *   1. data/default-repos.json        — hardcoded defaults, always included
 *   2. CCEE/Repo-Intelligence/tracked-repos.md — Obsidian-managed additions
 *   3. ~/.ccee/tracked-repos.json     — ad-hoc repos added via the review UI
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';
import type { TrackedRepo } from '../research/github-scanner.js';
import type { TrackedChannel } from '../research/youtube-pipeline.js';

const log = createTaggedLogger('config-reader');

// ---------------------------------------------------------------------------
// User repo file — ad-hoc repos added via the review UI
// ---------------------------------------------------------------------------

export type UserTrackedRepo = {
  readonly url: string;
  readonly addedAt: string;
  readonly notes: string;
};

const USER_REPOS_PATH = join(homedir(), '.ccee', 'tracked-repos.json');

/** Read user-added repos from ~/.ccee/tracked-repos.json. Returns [] if missing. */
export function readUserRepos(): UserTrackedRepo[] {
  if (!existsSync(USER_REPOS_PATH)) return [];
  try {
    return JSON.parse(readFileSync(USER_REPOS_PATH, 'utf-8')) as UserTrackedRepo[];
  } catch {
    return [];
  }
}

/** Write the full user repo list to ~/.ccee/tracked-repos.json. */
export function writeUserRepos(repos: UserTrackedRepo[]): void {
  mkdirSync(join(homedir(), '.ccee'), { recursive: true });
  writeFileSync(USER_REPOS_PATH, JSON.stringify(repos, null, 2), 'utf-8');
}

/** Normalise a GitHub URL to bare `github.com/owner/repo` format. */
export function normaliseRepoUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

/** Validate that a string looks like github.com/owner/repo. */
export function isValidRepoUrl(url: string): boolean {
  return /^github\.com\/[\w.-]+\/[\w.-]+$/.test(url);
}

/**
 * Read tracked repos from all sources and return a deduplicated merged list.
 *
 * Sources (applied in order, later sources add to — not replace — earlier ones):
 *   1. default-repos.json — mandatory defaults, always included
 *   2. Obsidian tracked-repos.md — operator additions via vault
 *   3. ~/.ccee/tracked-repos.json — ad-hoc additions via review UI
 */
export function readTrackedRepos(
  stagingPath: string,
  defaultReposPath: string
): TrackedRepo[] {
  const seen = new Set<string>();
  const merged: TrackedRepo[] = [];

  function addRepo(repo: TrackedRepo): void {
    const key = normaliseRepoUrl(repo.url);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(repo);
    }
  }

  // 1. Default repos (always loaded)
  try {
    const raw = readFileSync(defaultReposPath, 'utf-8');
    const parsed = JSON.parse(raw) as { mandatory?: TrackedRepo[] };
    for (const repo of parsed.mandatory ?? []) addRepo(repo);
    log.info(`loaded ${parsed.mandatory?.length ?? 0} repos from default-repos.json`);
  } catch (err: unknown) {
    log.warn(`failed to load default-repos.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Obsidian-managed repos (optional)
  const obsidianPath = join(stagingPath, 'CCEE', 'Repo-Intelligence', 'tracked-repos.md');
  if (existsSync(obsidianPath)) {
    try {
      const content = readFileSync(obsidianPath, 'utf-8');
      const repos = parseTrackedReposMarkdown(content);
      for (const repo of repos) addRepo(repo);
      log.info(`merged ${repos.length} repos from Obsidian staging`);
    } catch (err: unknown) {
      log.warn(`failed to parse tracked-repos.md: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. User-added repos from review UI
  const userRepos = readUserRepos();
  for (const ur of userRepos) {
    const name = ur.url.split('/').slice(-2).join('/');
    addRepo({ name, url: ur.url, extractPatterns: [] });
  }
  if (userRepos.length > 0) {
    log.info(`merged ${userRepos.length} user-added repos from ~/.ccee/tracked-repos.json`);
  }

  log.info(`total tracked repos: ${merged.length}`);
  return merged;
}

/**
 * Read tracked channels from the Obsidian staging file.
 * Falls back to default-channels.json.
 */
export function readTrackedChannels(
  stagingPath: string,
  defaultChannelsPath: string
): TrackedChannel[] {
  const obsidianPath = join(
    stagingPath,
    'CCEE',
    'YouTube-Intelligence',
    'tracked-channels.md'
  );

  if (existsSync(obsidianPath)) {
    try {
      const content = readFileSync(obsidianPath, 'utf-8');
      const channels = parseTrackedChannelsMarkdown(content);
      log.info(`loaded ${channels.length} channels from Obsidian staging`);
      return channels;
    } catch (err: unknown) {
      log.warn(
        `failed to parse tracked-channels.md: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  try {
    const raw = readFileSync(defaultChannelsPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      mandatory?: TrackedChannel[];
    };
    const channels = parsed.mandatory ?? [];
    log.info(`loaded ${channels.length} channels from default-channels.json`);
    return channels;
  } catch (err: unknown) {
    log.warn(`failed to load default-channels.json: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function parseTrackedReposMarkdown(content: string): TrackedRepo[] {
  const repos: TrackedRepo[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.includes('github.com')) {
      const url = trimmed.slice(2).trim();
      const name = url.split('/').slice(-2).join('/');
      repos.push({ name, url, extractPatterns: [] });
    }
  }

  return repos;
}

function parseTrackedChannelsMarkdown(content: string): TrackedChannel[] {
  const channels: TrackedChannel[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- @')) {
      const handle = trimmed.slice(2).trim();
      channels.push({
        handle,
        url: `https://www.youtube.com/${handle}`,
      });
    } else if (trimmed.startsWith('- https://www.youtube.com/')) {
      const url = trimmed.slice(2).trim();
      const handle = url.split('/').pop() ?? '';
      channels.push({ handle, url });
    }
  }

  return channels;
}
