/**
 * research.test.ts — Tests for the research phase modules.
 */

import { describe, it, expect, vi } from 'vitest';
import { hashString } from '../src/utils/hash.js';

// Mock axios for changelog and scraper tests
vi.mock('axios');

describe('research/changelog-parser', () => {
  it('exports fetchOfficialChangelog as a function', async () => {
    const { fetchOfficialChangelog } = await import('../src/research/changelog-parser.js');
    expect(typeof fetchOfficialChangelog).toBe('function');
  });

  it('exports fetchGithubReleases as a function', async () => {
    const { fetchGithubReleases } = await import('../src/research/changelog-parser.js');
    expect(typeof fetchGithubReleases).toBe('function');
  });
});

describe('research/github-scanner', () => {
  it('exports scanTrackedRepo as a function', async () => {
    const { scanTrackedRepo } = await import('../src/research/github-scanner.js');
    expect(typeof scanTrackedRepo).toBe('function');
  });

  it('exports discoverNewRepos as a function', async () => {
    const { discoverNewRepos } = await import('../src/research/github-scanner.js');
    expect(typeof discoverNewRepos).toBe('function');
  });
});

describe('research/web-scraper', () => {
  it('exports OFFICIAL_SOURCES with expected URLs', async () => {
    const { OFFICIAL_SOURCES } = await import('../src/research/web-scraper.js');
    expect(Array.isArray(OFFICIAL_SOURCES)).toBe(true);
    expect(OFFICIAL_SOURCES.length).toBeGreaterThan(0);
    expect(OFFICIAL_SOURCES[0]).toContain('http');
  });
});

describe('utils/hash', () => {
  it('produces consistent SHA-256 hash for same input', () => {
    const hash1 = hashString('test input');
    const hash2 = hashString('test input');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashString('input-a')).not.toBe(hashString('input-b'));
  });
});
