# Contributing to CCEE

## Development Setup

```bash
git clone https://github.com/gregdigittal/claude-code-evolution-engine.git
cd claude-code-evolution-engine
npm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and GITHUB_TOKEN
```

## Running Tests

```bash
npm test          # Run all tests
npm run typecheck # Type checking
npm run lint      # Linting
npm run build     # Compile TypeScript
```

## Code Style

- TypeScript strict mode — no `any` in public APIs
- `async/await` only — no `.then()` chains
- `error: unknown` in catch blocks, narrow with `instanceof Error`
- Files under 300 lines — split when larger
- All external calls wrapped in try/catch

## Adding New Phases

Each phase lives in `src/phases/0N-name.ts` and exports a single `run{Phase}Phase()` function.
Phases are orchestrated in `src/index.ts`.

## Pull Requests

- One logical change per PR
- PR title follows conventional commits format
- Add or update tests for changed behaviour
- Run `npm run typecheck && npm test` before submitting
