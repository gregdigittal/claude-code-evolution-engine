/**
 * sandbox.ts — Create isolated test environments for proposal validation.
 *
 * Copies current config to ~/.ccee/test-env/ and applies proposals there
 * before they touch the real config.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('sandbox');

const HOME = homedir();

const PROJECT_DIRS = [
  'ccrs',
  'virtual-analyst',
  'mission-control',
  'Development/Projects/social-media-agent',
] as const;

export type SandboxPaths = {
  readonly rootDir: string;
  readonly globalClaudeDir: string;
  readonly projectDirs: Record<string, string>;
};

/**
 * Create a full sandbox copy of the current Claude Code config.
 * Returns the sandbox paths for use by the validator.
 */
export function createSandbox(testEnvDir: string, runDate: string): SandboxPaths {
  const sandboxRoot = join(testEnvDir, runDate);

  // Clean up any existing sandbox for this run
  if (existsSync(sandboxRoot)) {
    rmSync(sandboxRoot, { recursive: true, force: true });
  }

  const globalClaudeDir = join(sandboxRoot, 'global', '.claude');
  const globalSource = join(HOME, '.claude');

  log.info(`creating sandbox at ${sandboxRoot}`);

  // Copy global config
  if (existsSync(globalSource)) {
    mkdirSync(globalClaudeDir, { recursive: true });
    cpSync(globalSource, globalClaudeDir, { recursive: true });
    log.info('copied global ~/.claude/ to sandbox');
  } else {
    mkdirSync(globalClaudeDir, { recursive: true });
    log.warn('~/.claude/ not found — sandbox will be empty');
  }

  // Copy project configs
  const projectDirs: Record<string, string> = {};
  for (const project of PROJECT_DIRS) {
    const sourcePath = join(HOME, project, '.claude');
    if (existsSync(sourcePath)) {
      const sandboxProjectDir = join(sandboxRoot, 'projects', project, '.claude');
      mkdirSync(sandboxProjectDir, { recursive: true });
      cpSync(sourcePath, sandboxProjectDir, { recursive: true });
      projectDirs[project] = sandboxProjectDir;
      log.info(`copied ${project}/.claude/ to sandbox`);
    }
  }

  return {
    rootDir: sandboxRoot,
    globalClaudeDir,
    projectDirs,
  };
}

/**
 * Apply a proposal's changes to a sandbox directory for Tier 2 testing.
 * Best-effort: create files that proposals say to create, ignore unknowns.
 */
export function applyProposalToSandbox(
  proposal: import('../proposals/generator.js').Proposal,
  sandboxClaudeDir: string
): void {
  for (const change of proposal.proposedChanges) {
    const targetPath = change.path.replace(/^~\/.claude/, sandboxClaudeDir);

    if (change.action === 'create') {
      if (targetPath.endsWith('/')) {
        mkdirSync(targetPath, { recursive: true });
      } else {
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, change.content ?? '', 'utf-8');
      }
    } else if (change.action === 'delete') {
      try {
        rmSync(targetPath, { force: true });
      } catch {
        // best-effort
      }
    } else if (change.action === 'modify') {
      if (existsSync(targetPath) && change.content !== undefined) {
        writeFileSync(targetPath, change.content, 'utf-8');
      }
    }
  }
}

/**
 * Remove the sandbox directory for a given run.
 */
export function destroySandbox(testEnvDir: string, runDate: string): void {
  const sandboxRoot = join(testEnvDir, runDate);
  try {
    rmSync(sandboxRoot, { recursive: true, force: true });
    log.info(`sandbox removed: ${sandboxRoot}`);
  } catch (err: unknown) {
    log.warn(`sandbox cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
