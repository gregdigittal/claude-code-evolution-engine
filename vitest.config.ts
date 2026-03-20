import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    server: {
      deps: {
        // @anthropic-ai/claude-code has no package.json exports — treat as external
        // so Vite skips static resolution. The dynamic import in sdk.ts is guarded
        // by try-catch and falls back to the CLI subprocess when unavailable.
        external: [/^@anthropic-ai\/claude-code/],
      },
    },
  },
});
