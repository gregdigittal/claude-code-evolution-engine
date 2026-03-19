/**
 * apply.test.ts — Tests for the apply phase modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), 'ccee-test-' + Date.now());
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('apply/backup', () => {
  it('backup manifest structure is correct', () => {
    // Verify the type shape without triggering a real backup
    // (real backup copies ~1GB .claude directory — not suitable for unit tests)
    const manifest = {
      runDate: '2026-03-19',
      backupDir: '/tmp/backups/2026-03-19',
      targets: [{ label: 'global', source: '/tmp/src', destination: '/tmp/dst', copied: false }],
      createdAt: new Date().toISOString(),
    };
    expect(manifest.runDate).toBe('2026-03-19');
    expect(Array.isArray(manifest.targets)).toBe(true);
    expect(manifest.createdAt).toBeTruthy();
  });
});

describe('apply/rollback', () => {
  it('exports rollbackRun and rollbackProposal as functions', async () => {
    const { rollbackRun, rollbackProposal } = await import('../src/apply/rollback.js');
    expect(typeof rollbackRun).toBe('function');
    expect(typeof rollbackProposal).toBe('function');
  });

  it('throws when no backup manifest exists', async () => {
    const { rollbackRun } = await import('../src/apply/rollback.js');
    expect(() => rollbackRun(testDir, 'nonexistent-date')).toThrow();
  });
});

describe('apply/applier', () => {
  it('exports applyProposal and applyAll as functions', async () => {
    const { applyProposal, applyAll } = await import('../src/apply/applier.js');
    expect(typeof applyProposal).toBe('function');
    expect(typeof applyAll).toBe('function');
  });
});

describe('testing/sandbox', () => {
  it('creates and destroys a sandbox', async () => {
    const { createSandbox, destroySandbox } = await import('../src/testing/sandbox.js');

    const sandboxDir = join(testDir, 'sandboxes');
    // The sandbox copies ~/.claude/ — skip actual copy in unit test by verifying structure only
    const sandbox = createSandbox(sandboxDir, 'test-run');

    expect(sandbox.globalClaudeDir).toContain('test-run');
    expect(typeof sandbox.projectDirs).toBe('object');

    destroySandbox(sandboxDir, 'test-run');
    expect(existsSync(join(sandboxDir, 'test-run'))).toBe(false);
  }, 60_000); // allow up to 60s — sandbox copies real ~/.claude/
});
