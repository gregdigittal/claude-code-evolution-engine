/**
 * config-reader.ts — Read tracked repos and channels from Obsidian staging notes.
 *
 * Parses the operator-managed markdown files in CCEE/Repo-Intelligence/ and
 * CCEE/YouTube-Intelligence/ to get the current tracking lists.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import type { TrackedRepo } from '../research/github-scanner.js';
import type { TrackedChannel } from '../research/youtube-pipeline.js';

const log = createTaggedLogger('config-reader');

/**
 * Read tracked repos from the Obsidian staging file.
 * Falls back to the default-repos.json if the staging file doesn't exist.
 */
export function readTrackedRepos(
  stagingPath: string,
  defaultReposPath: string
): TrackedRepo[] {
  const obsidianPath = join(
    stagingPath,
    'CCEE',
    'Repo-Intelligence',
    'tracked-repos.md'
  );

  // Try Obsidian file first
  if (existsSync(obsidianPath)) {
    try {
      const content = readFileSync(obsidianPath, 'utf-8');
      const repos = parseTrackedReposMarkdown(content);
      log.info(`loaded ${repos.length} repos from Obsidian staging`);
      return repos;
    } catch (err: unknown) {
      log.warn(
        `failed to parse tracked-repos.md: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Fall back to default-repos.json
  try {
    const raw = readFileSync(defaultReposPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      mandatory?: TrackedRepo[];
    };
    const repos = parsed.mandatory ?? [];
    log.info(`loaded ${repos.length} repos from default-repos.json`);
    return repos;
  } catch (err: unknown) {
    log.warn(`failed to load default-repos.json: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
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
