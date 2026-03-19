/**
 * Type declaration stub for @anthropic-ai/claude-code (globally installed).
 * Full types are available at runtime from the global package.
 */
declare module '@anthropic-ai/claude-code' {
  export function query(args: {
    prompt: string;
    options?: {
      maxTurns?: number;
      systemPrompt?: string;
      cwd?: string;
      model?: string;
    };
  }): AsyncGenerator<{ type: string; text?: string; [key: string]: unknown }>;
}
