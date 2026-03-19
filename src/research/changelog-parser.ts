/**
 * changelog-parser.ts — Fetch and parse Claude Code official changelog.
 *
 * Fetches entries from the Claude Code changelog and GitHub releases since
 * a given date, returning structured change entries.
 */

import axios from 'axios';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('changelog-parser');

export type ChangelogEntry = {
  readonly date: string;
  readonly version?: string;
  readonly title: string;
  readonly description: string;
  readonly source: 'official-docs' | 'github-releases' | 'anthropic-blog';
};

const CHANGELOG_URL =
  'https://code.claude.com/docs/en/changelog';
const GITHUB_RELEASES_URL =
  'https://api.github.com/repos/anthropics/claude-code/releases';

/**
 * Fetch the official Claude Code changelog page and extract entries.
 */
export async function fetchOfficialChangelog(
  since: Date
): Promise<ChangelogEntry[]> {
  try {
    log.info(`fetching changelog since ${since.toISOString().slice(0, 10)}`);
    const response = await axios.get<string>(CHANGELOG_URL, {
      timeout: 30_000,
      headers: { 'User-Agent': 'CCEE/0.1.0 (https://github.com/gregdigittal/claude-code-evolution-engine)' },
    });

    // TODO: Parse HTML/markdown changelog page and extract entries after `since`
    // For now, return an empty array — Phase 1 implementation will add HTML parsing
    log.info('changelog fetched — parsing not yet implemented');
    return [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`changelog fetch failed: ${message}`);
    return [];
  }
}

/**
 * Fetch GitHub releases for claude-code repo since a given date.
 */
export async function fetchGithubReleases(
  since: Date,
  githubToken: string
): Promise<ChangelogEntry[]> {
  try {
    log.info('fetching GitHub releases');
    const response = await axios.get<GithubRelease[]>(GITHUB_RELEASES_URL, {
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'CCEE/0.1.0',
      },
    });

    const sinceMs = since.getTime();
    return response.data
      .filter((r) => new Date(r.published_at).getTime() > sinceMs)
      .map((r) => ({
        date: r.published_at.slice(0, 10),
        version: r.tag_name,
        title: r.name || r.tag_name,
        description: r.body || '',
        source: 'github-releases' as const,
      }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`GitHub releases fetch failed: ${message}`);
    return [];
  }
}

type GithubRelease = {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
};
