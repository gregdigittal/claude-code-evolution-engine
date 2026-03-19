/**
 * youtube-pipeline.ts — YouTube intelligence pipeline.
 *
 * Fetches transcripts for relevant videos, extracts Claude Code insights
 * using the SDK, and deduplicates across sources.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTaggedLogger } from '../utils/logger.js';
import { querySonnet } from '../sdk.js';

const log = createTaggedLogger('youtube-pipeline');

export type TrackedChannel = {
  readonly handle: string;
  readonly url: string;
};

export type VideoIntelligence = {
  readonly videoId: string;
  readonly title: string;
  readonly channel: string;
  readonly publishedAt: string;
  readonly url: string;
  readonly takeaways: readonly string[];
  readonly configChanges: readonly string[];
  readonly relevanceScore: number; // 1-10
};

const SEARCH_QUERIES = [
  '"claude code" tutorial',
  '"claude code" tips',
  '"claude code" workflow',
  '"claude code" agent',
  '"claude code" plugin',
];

const YT_DLP_PATH = '/home/gregmorris/.local/bin/yt-dlp';

/**
 * Download a video transcript using yt-dlp.
 * Falls back to Whisper ASR if no auto-caption is available.
 */
export async function fetchTranscript(
  videoUrl: string,
  workDir: string
): Promise<string | null> {
  mkdirSync(workDir, { recursive: true });

  try {
    // Try auto-generated subtitles first
    execFileSync(
      YT_DLP_PATH,
      [
        '--write-auto-sub',
        '--sub-lang', 'en',
        '--skip-download',
        '--output', join(workDir, '%(id)s'),
        videoUrl,
      ],
      { encoding: 'utf-8', timeout: 120_000, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Find the .vtt file
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(workDir).filter((f) => f.endsWith('.vtt'));
    if (files.length > 0) {
      const raw = readFileSync(join(workDir, files[0]!), 'utf-8');
      return cleanVttTranscript(raw);
    }
  } catch {
    log.debug(`yt-dlp subtitle fetch failed for ${videoUrl}, trying audio download`);
  }

  // Fallback: download audio and use whisper
  try {
    const audioFile = join(workDir, 'audio.mp3');
    execFileSync(
      YT_DLP_PATH,
      [
        '--extract-audio',
        '--audio-format', 'mp3',
        '--output', audioFile,
        videoUrl,
      ],
      { encoding: 'utf-8', timeout: 300_000, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (existsSync(audioFile)) {
      // Try whisper
      const whisperBin = findWhisper();
      if (whisperBin) {
        execFileSync(
          whisperBin,
          [audioFile, '--model', 'base', '--language', 'en', '--output_dir', workDir],
          { encoding: 'utf-8', timeout: 600_000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const txtFile = join(workDir, 'audio.txt');
        if (existsSync(txtFile)) {
          return readFileSync(txtFile, 'utf-8');
        }
      }
    }
  } catch (err: unknown) {
    log.warn(`transcript fetch failed for ${videoUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Extract intelligence from a transcript using Claude SDK (Sonnet).
 */
export async function extractIntelligence(
  transcript: string,
  videoMeta: { id: string; title: string; channel: string; publishedAt: string; url: string }
): Promise<VideoIntelligence | null> {
  const prompt = `
Analyse this YouTube video transcript and extract Claude Code-relevant intelligence.

Video: "${videoMeta.title}" by ${videoMeta.channel}
Published: ${videoMeta.publishedAt}

Transcript:
${transcript.slice(0, 8000)}

Respond with JSON only:
{
  "takeaways": ["string", ...],
  "configChanges": ["string", ...],
  "relevanceScore": 1-10
}

Rules:
- Only include Claude Code-relevant content
- "configChanges" are specific, actionable config modifications
- relevanceScore: 1=barely relevant, 10=highly relevant
- If not Claude Code related at all, return relevanceScore: 0
`.trim();

  const result = await querySonnet({ prompt, phaseName: 'youtube-extraction' });

  if (!result.success) {
    log.warn(`intelligence extraction failed for ${videoMeta.id}`);
    return null;
  }

  try {
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      takeaways?: string[];
      configChanges?: string[];
      relevanceScore?: number;
    };

    if ((parsed.relevanceScore ?? 0) < 2) return null;

    return {
      videoId: videoMeta.id,
      title: videoMeta.title,
      channel: videoMeta.channel,
      publishedAt: videoMeta.publishedAt,
      url: videoMeta.url,
      takeaways: parsed.takeaways ?? [],
      configChanges: parsed.configChanges ?? [],
      relevanceScore: parsed.relevanceScore ?? 1,
    };
  } catch {
    log.warn(`JSON parse failed for intelligence extraction output`);
    return null;
  }
}

function cleanVttTranscript(vtt: string): string {
  return vtt
    .split('\n')
    .filter((line) => !line.match(/^WEBVTT|^\d{2}:\d{2}|^-->|^$/))
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function findWhisper(): string | null {
  const candidates = [
    'whisper',
    '/home/gregmorris/.local/bin/whisper',
    '/usr/local/bin/whisper',
  ];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--help'], { stdio: 'pipe', timeout: 5000 });
      return bin;
    } catch {
      continue;
    }
  }
  return null;
}
