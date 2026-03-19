/**
 * sdk.ts — Claude Code SDK wrapper with model routing.
 *
 * CCEE uses the globally installed @anthropic-ai/claude-code CLI via subprocess.
 * The `query()` export is from the SDK package — this wrapper handles both the
 * package API (when available) and the CLI subprocess fallback.
 *
 * Model tiers:
 *   haiku  — smoke tests, validation, simple classification
 *   sonnet — research synthesis, proposal generation (default)
 *   opus   — architecture diagrams, documentation writing (quality-critical)
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export type SdkQueryOptions = {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly model?: ModelTier;
  readonly maxTurns?: number;
  readonly phaseName?: string;
  readonly workspaceFiles?: Record<string, string>;
};

export type SdkQueryResult = {
  readonly success: boolean;
  readonly output: string;
  readonly workspaceDir: string;
  readonly error?: string;
};

// ---------------------------------------------------------------------------
// Model name mapping
// ---------------------------------------------------------------------------
const MODEL_MAP: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
  opus: 'claude-opus-4-5',
};

// Path to the globally installed claude CLI
const CLAUDE_CLI = '/usr/bin/claude';

// ---------------------------------------------------------------------------
// SDK query — invokes the Claude Code CLI in --print mode
// Each invocation gets an isolated workspace under /tmp/ccee-executions/
// ---------------------------------------------------------------------------
export async function queryModel(
  options: SdkQueryOptions
): Promise<SdkQueryResult> {
  const {
    prompt,
    systemPrompt,
    model = 'sonnet',
    maxTurns = 10,
    phaseName = 'phase',
    workspaceFiles = {},
  } = options;

  const runId = randomUUID();
  const workspaceDir = `/tmp/ccee-executions/${runId}/${phaseName}`;
  mkdirSync(workspaceDir, { recursive: true });

  // Write any provided workspace files
  for (const [filename, content] of Object.entries(workspaceFiles)) {
    writeFileSync(join(workspaceDir, filename), content, 'utf-8');
  }

  // Write a phase-specific CLAUDE.md if a system prompt was provided
  if (systemPrompt) {
    writeFileSync(
      join(workspaceDir, 'CLAUDE.md'),
      `# Phase Context\n\n${systemPrompt}\n`,
      'utf-8'
    );
  }

  try {
    // Try the SDK package query() function first (when installed locally)
    type SdkModule = { query: (args: {
      prompt: string;
      options?: { maxTurns?: number; cwd?: string; model?: string };
    }) => AsyncGenerator<{ type: string; text?: string }> };
    let sdkModule: SdkModule | null = null;

    try {
      // Try importing as a module — works if installed locally or via SDK API
      sdkModule = (await import('@anthropic-ai/claude-code')) as unknown as SdkModule;
    } catch {
      // Not available as a module — will fall through to CLI
    }

    if (sdkModule?.query) {
      let output = '';
      const stream = sdkModule.query({
        prompt,
        options: {
          maxTurns,
          cwd: workspaceDir,
          model: MODEL_MAP[model],
        },
      });

      for await (const message of stream) {
        if (message.type === 'assistant' && typeof message.text === 'string') {
          output += message.text;
        }
      }

      return { success: true, output, workspaceDir };
    }

    // Fallback: invoke claude CLI via subprocess in --print mode
    if (!existsSync(CLAUDE_CLI)) {
      return {
        success: false,
        output: '',
        workspaceDir,
        error: `Claude CLI not found at ${CLAUDE_CLI}. Install @anthropic-ai/claude-code globally.`,
      };
    }

    const args = [
      '--print',
      '--model', MODEL_MAP[model],
      '--max-turns', String(maxTurns),
      prompt,
    ];

    const output = execFileSync(CLAUDE_CLI, args, {
      encoding: 'utf-8',
      cwd: workspaceDir,
      timeout: 300_000, // 5 minutes max per phase
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { success: true, output: output.trim(), workspaceDir };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      output: '',
      workspaceDir,
      error: `SDK query failed: ${message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience wrappers per tier
// ---------------------------------------------------------------------------
export const querySonnet = (
  opts: Omit<SdkQueryOptions, 'model'>
): Promise<SdkQueryResult> => queryModel({ ...opts, model: 'sonnet' });

export const queryOpus = (
  opts: Omit<SdkQueryOptions, 'model'>
): Promise<SdkQueryResult> => queryModel({ ...opts, model: 'opus' });

export const queryHaiku = (
  opts: Omit<SdkQueryOptions, 'model'>
): Promise<SdkQueryResult> => queryModel({ ...opts, model: 'haiku' });
