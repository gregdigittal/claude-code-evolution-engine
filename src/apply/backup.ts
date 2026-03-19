/**
 * backup.ts — Create full backup of current Claude Code config before applying changes.
 *
 * No changes are applied without a confirmed backup. Backups are stored at
 * ~/.ccee/backups/{run-date}/ and are never deleted automatically.
 */

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('backup');

const HOME = homedir();

const BACKUP_TARGETS = [
  { label: 'global', source: join(HOME, '.claude') },
  { label: 'ccrs', source: join(HOME, 'ccrs', '.claude') },
  { label: 'virtual-analyst', source: join(HOME, 'virtual-analyst', '.claude') },
  { label: 'mission-control', source: join(HOME, 'mission-control', '.claude') },
  {
    label: 'social-media-agent',
    source: join(HOME, 'Development', 'Projects', 'social-media-agent', '.claude'),
  },
] as const;

export type BackupManifest = {
  readonly runDate: string;
  readonly backupDir: string;
  readonly targets: Array<{
    label: string;
    source: string;
    destination: string;
    copied: boolean;
  }>;
  readonly createdAt: string;
};

/**
 * Create a full backup of all Claude Code config directories.
 * Returns the backup manifest.
 */
export function createBackup(
  backupBaseDir: string,
  runDate: string
): BackupManifest {
  const backupDir = join(backupBaseDir, runDate);
  mkdirSync(backupDir, { recursive: true });

  const targets: BackupManifest['targets'] = [];

  for (const target of BACKUP_TARGETS) {
    const destination = join(backupDir, target.label);

    if (!existsSync(target.source)) {
      log.debug(`backup skip: ${target.source} not found`);
      targets.push({ ...target, destination, copied: false });
      continue;
    }

    try {
      mkdirSync(destination, { recursive: true });
      cpSync(target.source, destination, { recursive: true });
      log.info(`backed up ${target.label}: ${target.source} → ${destination}`);
      targets.push({ ...target, destination, copied: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`backup failed for ${target.label}: ${message}`);
      targets.push({ ...target, destination, copied: false });
    }
  }

  const manifest: BackupManifest = {
    runDate,
    backupDir,
    targets,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(
    join(backupDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  const copied = targets.filter((t) => t.copied).length;
  log.info(`backup complete: ${copied}/${targets.length} directories backed up → ${backupDir}`);

  return manifest;
}
