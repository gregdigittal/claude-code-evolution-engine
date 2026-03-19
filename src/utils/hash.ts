/**
 * hash.ts — SHA-256 hashing utilities for immutable state snapshots.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

/**
 * Hash a string value.
 */
export function hashString(input: string): string {
  return createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * Hash a file at the given path.
 * Returns null if the file cannot be read.
 */
export function hashFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Hash a JSON-serialisable object (stable: keys sorted).
 */
export function hashObject(obj: unknown): string {
  const stable = JSON.stringify(obj, Object.keys(obj as object).sort());
  return hashString(stable);
}

/**
 * Get a file's modification timestamp (unix ms) or null.
 */
export function fileMtime(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}
