/**
 * rollback.ts — Restore config from backup.
 *
 * Usage:
 *   ccee rollback {run-date}           — Restore entire run's backup
 *   ccee rollback {run-date} --proposal CCEE-XXX — Restore specific files
 */

import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createTaggedLogger } from '../utils/logger.js';
import type { BackupManifest } from './backup.js';

const log = createTaggedLogger('rollback');

const HOME = homedir();

/**
 * Rollback the entire run — restore all backed-up config directories.
 */
export function rollbackRun(backupBaseDir: string, runDate: string): void {
  const backupDir = join(backupBaseDir, runDate);
  const manifestPath = join(backupDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(`No backup manifest found at ${manifestPath}`);
  }

  const manifest: BackupManifest = JSON.parse(
    readFileSync(manifestPath, 'utf-8')
  );

  log.info(`rolling back run ${runDate}`);

  for (const target of manifest.targets) {
    if (!target.copied) {
      log.debug(`skip rollback for ${target.label}: was not backed up`);
      continue;
    }

    try {
      // Remove current config
      if (existsSync(target.source)) {
        rmSync(target.source, { recursive: true, force: true });
      }

      // Restore from backup
      cpSync(target.destination, target.source, { recursive: true });
      log.info(`restored ${target.label}: ${target.destination} → ${target.source}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`rollback failed for ${target.label}: ${message}`);
      throw new Error(`Rollback failed for ${target.label}: ${message}`);
    }
  }

  log.info(`rollback complete for run ${runDate}`);
}

/**
 * Rollback specific files for a single proposal.
 */
export function rollbackProposal(
  backupBaseDir: string,
  runDate: string,
  proposalId: string,
  filePaths: string[]
): void {
  const backupDir = join(backupBaseDir, runDate);
  log.info(`rolling back proposal ${proposalId}: ${filePaths.length} files`);

  for (const filePath of filePaths) {
    // Determine which backup target this file belongs to
    const globalBackupDir = join(backupDir, 'global');
    const relativeToHome = filePath.startsWith(HOME)
      ? filePath.slice(HOME.length + 1)
      : null;

    if (!relativeToHome) {
      log.warn(`cannot determine backup location for ${filePath}`);
      continue;
    }

    // Map ~/.claude → global backup
    const backupFilePath = relativeToHome.startsWith('.claude')
      ? join(globalBackupDir, relativeToHome.slice('.claude/'.length))
      : null;

    if (!backupFilePath || !existsSync(backupFilePath)) {
      log.warn(`backup file not found: ${backupFilePath}`);
      continue;
    }

    try {
      cpSync(backupFilePath, filePath);
      log.info(`restored: ${filePath}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`file rollback failed: ${filePath}: ${message}`);
    }
  }
}
