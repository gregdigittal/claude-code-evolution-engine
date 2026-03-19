/**
 * git.ts — Git utilities for repo cloning, fetching, diffing.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from './logger.js';

const log = createTaggedLogger('git');

/**
 * Run a git command, returning stdout. Throws on non-zero exit.
 * Uses execFileSync (not exec) to avoid shell injection.
 */
function gitExec(args: string[], cwd?: string): string {
  const result = execFileSync('git', args, {
    encoding: 'utf-8',
    timeout: 60_000,
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return typeof result === 'string' ? result.trim() : '';
}

/**
 * Ensure a shallow clone of `url` exists at `targetDir`.
 * If it already exists, fetch latest instead.
 */
export async function ensureShallowClone(
  url: string,
  targetDir: string
): Promise<void> {
  const httpsUrl = url.startsWith('http') ? url : `https://${url}`;

  if (existsSync(join(targetDir, '.git'))) {
    log.info(`fetch: ${url}`);
    try {
      gitExec(['fetch', '--depth', '1', 'origin'], targetDir);
    } catch (err: unknown) {
      log.warn(`fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log.info(`clone: ${url} → ${targetDir}`);
    mkdirSync(targetDir, { recursive: true });
    try {
      gitExec(['clone', '--depth', '1', httpsUrl, targetDir]);
    } catch (err: unknown) {
      log.warn(`clone failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Get the current HEAD SHA of a repo.
 */
export function getHeadSha(repoDir: string): string | null {
  try {
    return gitExec(['rev-parse', 'HEAD'], repoDir);
  } catch {
    return null;
  }
}

/**
 * Get a list of files changed since a given commit SHA.
 */
export function getChangedFiles(repoDir: string, sinceRef: string): string[] {
  try {
    const output = gitExec(['diff', '--name-only', sinceRef, 'HEAD'], repoDir);
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Stage and commit all files in a repository with the given message.
 */
export function commitAll(repoDir: string, message: string): void {
  try {
    gitExec(['add', '-A'], repoDir);
    gitExec(['commit', '-m', message], repoDir);
    log.info(`committed: ${message}`);
  } catch (err: unknown) {
    log.error(`commit failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Push to the configured remote.
 */
export function pushToRemote(
  repoDir: string,
  remote = 'origin',
  branch = 'main'
): void {
  try {
    gitExec(['push', remote, branch], repoDir);
    log.info(`pushed to ${remote}/${branch}`);
  } catch (err: unknown) {
    log.warn(`push failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
