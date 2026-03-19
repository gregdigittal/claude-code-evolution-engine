/**
 * config.ts — Load and validate environment configuration.
 * Exports a typed Config object consumed throughout the pipeline.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Load .env if present (simple manual loader — no dotenv dependency)
// ---------------------------------------------------------------------------
function loadDotEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional — fall through
  }
}

loadDotEnv();

// ---------------------------------------------------------------------------
// Required variables — startup fails if any are missing
// ---------------------------------------------------------------------------
const REQUIRED_VARS = ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN'] as const;

export function validateConfig(): void {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `[CCEE] Missing required environment variables: ${missing.join(', ')}\n` +
        'Copy .env.example to .env and fill in the required values.'
    );
  }
}

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------
export type Config = {
  readonly anthropicApiKey: string;
  readonly githubToken: string;
  readonly obsidianStagingPath: string;
  readonly obsidianVaultGitRemote: string | undefined;
  readonly reviewUiPort: number;
  readonly healthPort: number;
  readonly tailscaleIp: string;
  readonly slackWebhookUrl: string | undefined;
  readonly dataDir: string;
  readonly runDir: string;
  readonly backupDir: string;
  readonly cacheDir: string;
  readonly testEnvDir: string;
};

// ---------------------------------------------------------------------------
// Build config object
// ---------------------------------------------------------------------------
export function buildConfig(): Config {
  validateConfig();
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    githubToken: process.env.GITHUB_TOKEN!,
    obsidianStagingPath:
      process.env.OBSIDIAN_STAGING_PATH ||
      '/home/gregmorris/ccee-obsidian-staging',
    obsidianVaultGitRemote: process.env.OBSIDIAN_VAULT_GIT_REMOTE,
    reviewUiPort: parseInt(process.env.REVIEW_UI_PORT || '9898', 10),
    healthPort: parseInt(process.env.HEALTH_PORT || '3000', 10),
    tailscaleIp: process.env.VPS_TAILSCALE_IP || '100.88.238.20',
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    dataDir: process.env.DATA_DIR || './data',
    runDir:
      process.env.CCEE_RUN_DIR || '/home/gregmorris/.ccee/runs',
    backupDir:
      process.env.CCEE_BACKUP_DIR || '/home/gregmorris/.ccee/backups',
    cacheDir:
      process.env.CCEE_CACHE_DIR || '/home/gregmorris/.ccee/repo-cache',
    testEnvDir:
      process.env.CCEE_TEST_ENV_DIR || '/home/gregmorris/.ccee/test-env',
  };
}

export const config = buildConfig();
