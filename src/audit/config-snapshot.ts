/**
 * config-snapshot.ts — Capture full snapshot of current Claude Code configs.
 *
 * Snapshots global ~/.claude/ and all project .claude/ directories.
 * Each file is hashed for immutable state tracking.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { hashFile } from '../utils/hash.js';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('config-snapshot');

const HOME = homedir();

export type FileEntry = {
  readonly path: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly lastModifiedMs: number;
  readonly sha256: string | null;
};

export type ConfigDirectory = {
  readonly label: string;
  readonly absolutePath: string;
  readonly exists: boolean;
  readonly files: readonly FileEntry[];
  readonly counts: {
    readonly skills: number;
    readonly hooks: number;
    readonly agents: number;
    readonly commands: number;
    readonly rules: number;
    readonly total: number;
  };
};

export type ConfigSnapshot = {
  readonly capturedAt: string;
  readonly globalConfig: ConfigDirectory;
  readonly projectConfigs: readonly ConfigDirectory[];
};

const WATCHED_DIRS: Array<{ label: string; path: string }> = [
  { label: 'global', path: join(HOME, '.claude') },
  { label: 'project:ccrs', path: join(HOME, 'ccrs', '.claude') },
  { label: 'project:virtual-analyst', path: join(HOME, 'virtual-analyst', '.claude') },
  { label: 'project:mission-control', path: join(HOME, 'mission-control', '.claude') },
  {
    label: 'project:social-media-agent',
    path: join(HOME, 'Development', 'Projects', 'social-media-agent', '.claude'),
  },
];

/**
 * Recursively list all files under a directory.
 */
function listFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listFiles(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory unreadable — skip
  }
  return results;
}

/**
 * Count config items by directory name.
 */
function countItems(files: FileEntry[]): ConfigDirectory['counts'] {
  const inDir = (subdir: string) =>
    files.filter((f) => f.relativePath.startsWith(`${subdir}/`)).length;

  return {
    skills: inDir('skills'),
    hooks: inDir('hooks'),
    agents: inDir('agents'),
    commands: inDir('commands') + files.filter((f) => f.relativePath.startsWith('slash/')).length,
    rules: inDir('rules'),
    total: files.length,
  };
}

/**
 * Snapshot a single .claude/ directory.
 */
function snapshotDirectory(label: string, absolutePath: string): ConfigDirectory {
  if (!existsSync(absolutePath)) {
    log.debug(`${label}: path not found — ${absolutePath}`);
    return {
      label,
      absolutePath,
      exists: false,
      files: [],
      counts: { skills: 0, hooks: 0, agents: 0, commands: 0, rules: 0, total: 0 },
    };
  }

  const allPaths = listFiles(absolutePath);
  const files: FileEntry[] = allPaths.map((p) => {
    const stat = statSync(p);
    return {
      path: p,
      relativePath: relative(absolutePath, p),
      sizeBytes: stat.size,
      lastModifiedMs: stat.mtimeMs,
      sha256: hashFile(p),
    };
  });

  return {
    label,
    absolutePath,
    exists: true,
    files,
    counts: countItems(files),
  };
}

/**
 * Capture a full config snapshot for all watched directories.
 */
export function captureSnapshot(outputDir: string): ConfigSnapshot {
  log.info('capturing config snapshot');

  const [globalDir, ...projectDirs] = WATCHED_DIRS;

  const globalConfig = snapshotDirectory(globalDir!.label, globalDir!.path);
  const projectConfigs = projectDirs.map((d) =>
    snapshotDirectory(d.label, d.path)
  );

  const snapshot: ConfigSnapshot = {
    capturedAt: new Date().toISOString(),
    globalConfig,
    projectConfigs,
  };

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    join(outputDir, 'config-snapshot.json'),
    JSON.stringify(snapshot, null, 2),
    'utf-8'
  );

  log.info(
    `snapshot: ${globalConfig.counts.total} global files, ` +
      `${projectConfigs.reduce((s, p) => s + p.counts.total, 0)} project files`
  );

  return snapshot;
}
