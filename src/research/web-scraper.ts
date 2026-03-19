/**
 * web-scraper.ts — Lightweight HTTP scraper for official sources.
 *
 * Fetches Anthropic docs, blog, MCP registry, etc. with rate limiting
 * and conditional requests (ETag / Last-Modified).
 */

import axios, { AxiosRequestConfig } from 'axios';
import { createTaggedLogger } from '../utils/logger.js';

const log = createTaggedLogger('web-scraper');

export type ScrapedPage = {
  readonly url: string;
  readonly content: string;
  readonly contentType: string;
  readonly fetchedAt: string;
  readonly etag?: string;
  readonly lastModified?: string;
};

const DEFAULT_HEADERS = {
  'User-Agent': 'CCEE/0.1.0 (https://github.com/gregdigittal/claude-code-evolution-engine)',
  Accept: 'text/html,application/xhtml+xml,application/json,text/plain',
};

/**
 * Fetch a URL, optionally using conditional request headers to avoid
 * re-downloading unchanged content.
 */
export async function fetchPage(
  url: string,
  options: {
    etag?: string;
    lastModified?: string;
    timeoutMs?: number;
  } = {}
): Promise<ScrapedPage | null> {
  const { etag, lastModified, timeoutMs = 30_000 } = options;

  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (etag) headers['If-None-Match'] = etag;
  if (lastModified) headers['If-Modified-Since'] = lastModified;

  try {
    const response = await axios.get<string>(url, {
      timeout: timeoutMs,
      headers,
      validateStatus: (s) => s < 400 || s === 304,
    });

    if (response.status === 304) {
      log.debug(`not modified: ${url}`);
      return null;
    }

    return {
      url,
      content: typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data),
      contentType: String(response.headers['content-type'] ?? 'text/html'),
      fetchedAt: new Date().toISOString(),
      etag: String(response.headers['etag'] ?? ''),
      lastModified: String(response.headers['last-modified'] ?? ''),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`fetch failed for ${url}: ${message}`);
    return null;
  }
}

/**
 * Fetch multiple URLs with a delay between each to respect rate limits.
 */
export async function fetchPages(
  urls: readonly string[],
  delayMs = 1000
): Promise<Map<string, ScrapedPage>> {
  const results = new Map<string, ScrapedPage>();
  for (const url of urls) {
    const page = await fetchPage(url);
    if (page) results.set(url, page);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

/**
 * Sources to scrape for Claude Code intelligence.
 */
export const OFFICIAL_SOURCES = [
  'https://code.claude.com/docs/en/changelog',
  'https://docs.anthropic.com',
  'https://www.anthropic.com/news',
  'https://registry.modelcontextprotocol.io/',
] as const;
