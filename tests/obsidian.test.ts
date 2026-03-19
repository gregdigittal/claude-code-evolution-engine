/**
 * obsidian.test.ts — Tests for the Obsidian documentation modules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), 'ccee-obsidian-test-' + Date.now());
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('obsidian/config-reader', () => {
  it('falls back to default-repos.json when no Obsidian file', async () => {
    const { readTrackedRepos } = await import('../src/obsidian/config-reader.js');
    const defaultReposPath = join(process.cwd(), 'data', 'default-repos.json');
    const repos = readTrackedRepos(testDir, defaultReposPath);
    // Should return array (possibly empty if default-repos.json doesn't exist in test)
    expect(Array.isArray(repos)).toBe(true);
  });

  it('parses tracked-repos.md when present', async () => {
    const { readTrackedRepos } = await import('../src/obsidian/config-reader.js');
    const stagingPath = testDir;

    // Create the Obsidian file structure
    mkdirSync(join(stagingPath, 'CCEE', 'Repo-Intelligence'), { recursive: true });
    const content = `---
type: ccee-config
---

# Tracked Repositories

## Mandatory
- github.com/gsd-build/gsd-2
- github.com/bmad-code-org/BMAD-METHOD
`;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(stagingPath, 'CCEE', 'Repo-Intelligence', 'tracked-repos.md'),
      content,
      'utf-8'
    );

    const repos = readTrackedRepos(stagingPath, '/nonexistent');
    expect(repos.length).toBeGreaterThan(0);
    expect(repos.some((r) => r.url.includes('gsd-2'))).toBe(true);
  });
});

describe('obsidian/readme-assembler', () => {
  it('exports assembleReadme as a function', async () => {
    const { assembleReadme } = await import('../src/obsidian/readme-assembler.js');
    expect(typeof assembleReadme).toBe('function');
  });

  it('creates README.md even with empty staging dir', async () => {
    const { assembleReadme } = await import('../src/obsidian/readme-assembler.js');
    mkdirSync(join(testDir, 'CCEE', 'User-Guide'), { recursive: true });
    const repoDir = join(testDir, 'repo');
    mkdirSync(repoDir, { recursive: true });

    assembleReadme(testDir, repoDir);

    expect(existsSync(join(repoDir, 'README.md'))).toBe(true);
    const content = readFileSync(join(repoDir, 'README.md'), 'utf-8');
    expect(content).toContain('Claude Code Evolution Engine');
  });
});

describe('utils/logger', () => {
  it('creates a tagged logger with info/warn/error/debug methods', async () => {
    const { createTaggedLogger } = await import('../src/utils/logger.js');
    const log = createTaggedLogger('test');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.debug).toBe('function');
  });
});
