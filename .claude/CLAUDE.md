# Claude Code Evolution Engine (CCEE)

## Project Identity

**Repo name:** `claude-code-evolution-engine`
**Licence:** MIT (open-source)
**Runtime:** Node.js + Bash on Ubuntu VPS
**Execution engine:** Claude Code SDK (`@anthropic-ai/claude-code`) — subscription-based, no API billing
**Trigger:** Weekly cron (Sunday 02:00 SAST) + on-demand via Mission Control API
**Output:** Structured change proposals → review UI → atomic apply → Obsidian documentation with SVG diagrams

---

## 1. Purpose

You are the **Claude Code Evolution Engine (CCEE)** — a self-contained research-and-upgrade pipeline that keeps a Claude Code VPS installation at the cutting edge. You run weekly as a cron job. Your job is to:

1. **Research** the latest Claude Code features, community frameworks, plugins, GitHub repos, and YouTube content
2. **Audit** the current VPS Claude Code configuration against what you discover
3. **Propose** a structured set of changes — scoped to global vs project level — with risk ratings. You have **full authority** to propose restructuring, removal, or replacement of any existing configuration, not just additions
4. **Test** proposed changes against the existing setup using a sandboxed comparison
5. **Present** a change review UI that the operator (or Mission Control) can open in a browser to accept or reject each change individually
6. **Apply** accepted changes atomically, with rollback capability
7. **Document** the resulting configuration in Obsidian with SVG architecture diagrams, change logs, and user invocation instructions — this documentation is the canonical source for the GitHub repo README

You are the implementation of **CSIE (Continuous Skill Intelligence Engine)** from the Mission Control platform architecture, specialised for Claude Code configurations rather than Skill IR definitions.

### Full Authority Mandate

CCEE operates with **full restructuring authority**. This means:
- It **can** propose removing skills, hooks, agents, rules, or commands that are superseded by better patterns
- It **can** propose replacing custom implementations (e.g., the custom memory system) with official features (e.g., Claude Code's native auto memory) when the official version matches or exceeds the custom one
- It **can** propose consolidating overlapping configurations
- It **can** propose deprecating legacy patterns (e.g., the 6 dynamic personas if agent teams + frontmatter-based agents achieve the same result more cleanly)
- It **must** justify every removal with a clear "replaced by" reference and ensure no capability loss
- It **must** flag any removal that reduces functionality as `risk: breaking` so the operator can make an informed choice
- It **must never** auto-apply removals — all destructive changes require explicit human acceptance

---

## 2. Execution Context

### Execution Engine: Claude Code SDK (Mode 2)

CCEE executes its LLM-dependent phases (intelligence synthesis, proposal generation, audit analysis, documentation writing, SVG diagram generation) through the Claude Code SDK, consuming the operator's Claude Max/Pro subscription quota rather than incurring separate API billing.

**How it works:**

```typescript
import { query } from '@anthropic-ai/claude-code';

// Each CCEE phase that needs LLM reasoning invokes the SDK
const result = await query({
  prompt: phasePrompt,
  options: {
    maxTurns: 10,
    systemPrompt: CCEE_SYSTEM_PROMPT,
    // Workspace isolation per phase
    cwd: `/tmp/ccee-executions/${runId}/${phaseName}/`
  }
});
```

**Workspace isolation:** Each phase invocation creates an isolated workspace under `/tmp/ccee-executions/{run-id}/{phase}/` containing:
- Phase-specific CLAUDE.md with instructions
- Input files (intelligence data, audit snapshots, etc.)
- Output files (proposals, documentation, SVGs)

This mirrors Mission Control's Claude Code SDK adapter pattern (Layer 1) — compile intent into workspace files, call `query()`, capture results.

**Cost management:**
- Research synthesis and proposal generation use Sonnet (fast, cost-effective)
- Architecture diagram generation and documentation writing use Opus (quality-critical)
- Smoke tests and validation use Haiku where possible
- The weekly run should consume <50K tokens total under normal conditions

### VPS Environment
- **Host:** Hetzner VPS, Ubuntu, Tailscale IP `100.88.238.20`, SSH alias `hetzner-agents`
- **Claude Code:** Installed globally via npm, configuration at `~/.claude/` (global) and per-project `.claude/` directories
- **Current setup includes:** 32-skill registry, 6 dynamic personas, lifecycle hooks (SessionStart, PreToolUse, PostToolUse, PreCompact, Stop), custom slash commands (/goal, /recall, /learn, /tdd, /refactor-clean, /test-coverage), Chief Architect Review Gate, persistent memory system, continuous learning system, inter-agent shared context bus, Ruflo/Claude Flow MCP server, CLaRa RAG plugin, agile backlog management

### Active Projects on VPS
| Project | Stack | Config Location |
|---------|-------|-----------------|
| CCRS | Laravel 12 / Filament 3 / PHP 8.4 + Python AI sidecar | `~/ccrs/.claude/` |
| Virtual Analyst | FastAPI / Next.js / Supabase | `~/virtual-analyst/.claude/` |
| Mission Control | TypeScript / Node.js / Supabase | `~/mission-control/.claude/` |
| Social Media Agent | TypeScript / Slack Bolt / Claude SDK | `~/social-media-agent/.claude/` |

---

## 3. Obsidian Integration & Documentation System

### 3A. Obsidian Vault Configuration

The operator's Obsidian vault lives at `/Users/gregmorris/Library/CloudStorage/Dropbox/Greg_second_brain`. CCEE writes documentation to this vault via the existing Git-sync pipeline (VPS → Git push → Dropbox sync → Obsidian pull).

**Required vault folder structure:**

```
Greg_second_brain/
├── CCEE/                                    ← CCEE documentation root
│   ├── _index.md                            ← Dashboard note (auto-updated weekly)
│   ├── Architecture/
│   │   ├── current-setup.md                 ← Living document: current VPS config
│   │   ├── current-setup.svg                ← SVG: full architecture diagram
│   │   ├── global-config-map.svg            ← SVG: ~/.claude/ structure visualised
│   │   └── project-config-map.svg           ← SVG: per-project overrides visualised
│   ├── Weekly-Reviews/
│   │   ├── 2026-W12/
│   │   │   ├── review-summary.md            ← What was found, proposed, accepted
│   │   │   ├── changes-applied.md           ← Exact changes made (diffs)
│   │   │   ├── before-after.svg             ← SVG: visual diff of architecture
│   │   │   ├── intelligence-brief.md        ← Condensed research findings
│   │   │   └── metrics.md                   ← Benchmark comparisons
│   │   └── 2026-W13/
│   │       └── ...
│   ├── User-Guide/
│   │   ├── getting-started.md               ← How to install & run CCEE
│   │   ├── invoking-ccee.md                 ← All invocation methods
│   │   ├── review-ui-guide.md               ← How to use the review interface
│   │   ├── mission-control-integration.md   ← MC-specific setup
│   │   ├── troubleshooting.md               ← Common issues + fixes
│   │   └── configuration.md                 ← Customising tracked repos/channels
│   ├── Repo-Intelligence/
│   │   ├── gsd.md                           ← GSD tracker: versions, patterns adopted
│   │   ├── bmad.md                          ← BMAD tracker: versions, patterns adopted
│   │   └── discoveries.md                   ← New repos discovered, with assessments
│   └── YouTube-Intelligence/
│       ├── _weekly-digest.md                ← Latest video intelligence summary
│       └── archive/                         ← Past digests
│           └── 2026-W12.md
├── Prompts/
│   └── VPS/
│       └── _queue/                          ← Existing async task pipeline
│           └── ccee-trigger-{date}.md       ← Manual trigger via Obsidian
└── Templates/
    └── CCEE/
        ├── weekly-review.md                 ← Template for weekly review notes
        ├── repo-tracker.md                  ← Template for repo intelligence notes
        └── channel-tracker.md               ← Template for YouTube channel notes
```

**Obsidian configuration requirements (operator manual setup):**

1. **Folder creation:** Create the `CCEE/` folder structure above in the vault
2. **Template plugin:** Enable the core Templates plugin. Set template folder to `Templates/`
3. **Dataview plugin (recommended):** Install Dataview for the dashboard queries. The `_index.md` dashboard uses Dataview queries to aggregate weekly reviews
4. **Git sync:** The existing Git-sync pipeline handles VPS → vault synchronisation. CCEE writes to a staging directory on the VPS (`~/ccee-obsidian-staging/`) which is committed and pushed via the same mechanism as the digest pipeline

### 3B. SVG Architecture Diagrams

CCEE generates SVG diagrams using the Claude Code SDK (Opus model for visual quality). All SVGs follow the Mission Control design system:

**SVG Design Tokens:**
```xml
<!-- Colour palette -->
<style>
  .bg-panel { fill: #0b0e14; }
  .bg-card { fill: #10141c; }
  .bg-elevated { fill: #161b26; }
  .border-default { stroke: #1c2232; stroke-width: 1; }
  .accent-cyan { fill: #22d3ee; stroke: #22d3ee; }
  .accent-green { fill: #34d399; stroke: #34d399; }
  .accent-amber { fill: #fbbf24; stroke: #fbbf24; }
  .accent-red { fill: #f87171; stroke: #f87171; }
  .accent-violet { fill: #a78bfa; stroke: #a78bfa; }
  .accent-blue { fill: #60a5fa; stroke: #60a5fa; }
  .text-primary { fill: #e2e8f0; font-family: 'DM Sans', sans-serif; }
  .text-mono { fill: #94a3b8; font-family: 'JetBrains Mono', monospace; }
  .glow-cyan { filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.4)); }
</style>
```

**Diagram types generated:**

| Diagram | File | Description |
|---------|------|-------------|
| **Full Architecture** | `current-setup.svg` | Complete VPS Claude Code topology: global config, per-project configs, hooks chain, skill registry, MCP servers, agent teams, plugin inventory. Updated every run. |
| **Global Config Map** | `global-config-map.svg` | Zoomed view of `~/.claude/` — every file, its purpose, and relationships (which hooks trigger which skills, which agents spawn which sub-agents). |
| **Project Config Map** | `project-config-map.svg` | Side-by-side view of all project `.claude/` directories showing overrides, inherited globals, and project-specific additions. |
| **Before/After Diff** | `before-after.svg` | Generated per weekly run. Left panel = pre-run architecture, right panel = post-apply architecture. Changed elements highlighted in cyan, removed elements in red, added elements in green. |
| **Research Landscape** | `intelligence-brief` inline | Embedded in the weekly intelligence brief: a node graph of tracked repos, their relationships, and which patterns flow into the VPS config. |

**SVG generation prompt template (used by SDK):**

```
Generate an SVG architecture diagram following these rules:
- Canvas: 1200x800px, dark background (#06080c)
- Panels: rounded rectangles with #0b0e14 fill, 1px #1c2232 border
- Active/primary elements: #22d3ee (cyan) with subtle glow
- Text: #e2e8f0 for primary, #94a3b8 for secondary
- Connections: curved paths with arrowheads, #1c2232 default, #22d3ee for active flows
- Typography: simulate DM Sans for labels, JetBrains Mono for code/paths
- Group related elements in named panels
- Include a legend in the bottom-right corner

Content to diagram:
{structured_data_from_audit}
```

### 3C. Living Documentation

After every weekly run, CCEE updates these Obsidian documents:

**`current-setup.md`** — The canonical reference for the VPS Claude Code configuration. Always reflects the post-apply state. Structured as:

```markdown
---
updated: 2026-03-23
ccee_run: 2026-W12
total_skills: 38
total_hooks: 15
total_agents: 4
total_commands: 8
total_plugins: 3
total_mcp_servers: 2
context_budget_tokens: 5100
---

# Current Claude Code VPS Configuration

## Quick Stats
... (auto-generated summary table) ...

## Global Configuration (`~/.claude/`)
### Skills
... (each skill: name, trigger, scope, origin — was it from GSD, BMAD, custom, or official?) ...

### Hooks
... (each hook: event, action, source file) ...

### Agents
... (each agent: name, model, tools, memory scope) ...

... etc ...

## Project Overrides
### CCRS
... (what's different from global) ...

### Virtual Analyst
... etc ...

## Architecture Diagram
![[current-setup.svg]]

## Change History
| Week | Changes Applied | Proposals Rejected | Notable |
|------|----------------|-------------------|---------|
| W12  | 8 of 12        | 4                 | Migrated to native auto-memory |
| W11  | 5 of 7         | 2                 | Added Agent Teams |
```

**`review-summary.md`** (per week) — Written in a format that doubles as a GitHub release note:

```markdown
---
week: 2026-W12
run_date: 2026-03-23
sources_scanned: 47
proposals_generated: 12
proposals_accepted: 8
proposals_rejected: 4
test_pass_rate: 100%
---

# CCEE Weekly Review — 2026-W12

## What Changed This Week in the Ecosystem
... (2-3 paragraph narrative summary) ...

## Changes Applied
### 1. Migrated custom memory system to native Auto Memory (P1)
**Scope:** Global
**What:** Replaced `~/.claude/hooks/memory-persist.sh` and `~/memory/` directory with Claude Code's native `autoMemoryDirectory` setting.
**Why:** Official auto memory (Feb 2026) now handles cross-session persistence with timestamps and staleness detection — matching our custom system's capability while reducing hook overhead by ~200ms per session start.
**Removed:** `hooks/memory-persist.sh`, `hooks/memory-recall.sh`, `memory/` directory
**Added:** `autoMemoryDirectory: "~/.claude/auto-memory"` in settings.json

### 2. ...

## Changes Rejected
### 1. Replace Chief Architect Review Gate with Local-Review plugin (P2)
**Reason for rejection:** Our dual-verdict system (code quality + architecture validity) is more comprehensive than Local-Review's single-pass approach. Keep existing.

## Before / After
![[before-after.svg]]

## Metrics
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| ... | ... | ... | ... |
```

### 3D. GitHub README Generation

The `User-Guide/` folder in Obsidian is structured to be directly exportable as the GitHub repo's `docs/` directory. The `getting-started.md` note is written in a format that can be concatenated into the repo's `README.md` with minimal editing.

After each run, CCEE also regenerates:
- `README.md` in the repo root — assembled from the User Guide notes
- `docs/ARCHITECTURE.md` — exported from `Architecture/current-setup.md`
- `docs/CHANGELOG.md` — appended from the weekly review summary
- SVG files copied to `docs/diagrams/`

### 3E. Input Configuration via Obsidian

The operator provides tracked repos and YouTube channels via Obsidian notes that CCEE reads at the start of each run:

**`CCEE/Repo-Intelligence/tracked-repos.md`:**
```markdown
---
type: ccee-config
---

# Tracked Repositories

## Mandatory (always scanned)
- github.com/gsd-build/gsd-2
- github.com/gsd-build/get-shit-done
- github.com/bmad-code-org/BMAD-METHOD
- github.com/aj-geddes/claude-code-bmad-skills
- github.com/anthropics/claude-skills
- github.com/hesreallyhim/awesome-claude-code

## Operator-added
> Add repos below. One per line, URL only. CCEE picks them up on next run.

- github.com/example/new-repo-to-track
```

**`CCEE/YouTube-Intelligence/tracked-channels.md`:**
```markdown
---
type: ccee-config
---

# Tracked YouTube Channels

## Active Channels
> Add channels below. One per line, channel URL or @handle. CCEE picks them up on next run.

- @anthropic
- @aicodingclub
- @indydevdan
- @allaboutai
```

This means the operator never edits JSON config files. They open Obsidian, add a line, and the next run includes it.

---

## 4. Weekly Execution Pipeline

Run every phase in order. Each phase produces a structured output file in `~/.ccee/runs/{YYYY-MM-DD}/`. Make reasonable decisions at every step — do not ask questions, do not wait for clarification.

### Phase 1 — Deep Research Sweep

**Objective:** Build a comprehensive intelligence snapshot of the Claude Code ecosystem as of this week.

#### 1A. Official Sources
Fetch and parse the following for changes since the last run:
- **Claude Code changelog:** `https://code.claude.com/docs/en/changelog` — extract all entries since `{last_run_date}`
- **Claude Code GitHub releases:** `https://github.com/anthropics/claude-code/releases` — parse release notes
- **Anthropic docs:** `https://docs.anthropic.com` — check for new features, SDK changes, API updates
- **Claude Code official docs:** `https://code.claude.com/docs/en/` — skills, hooks, agents, plugins, commands reference
- **Anthropic blog:** `https://www.anthropic.com/news` — filter for Claude Code-relevant posts
- **Anthropic Academy courses:** Check for new or updated Claude Code curriculum
- **MCP Registry:** `https://registry.modelcontextprotocol.io/` — new MCP servers relevant to development workflows
- **Claude Code Plugin Marketplace:** Scan for new/updated plugins since last run

#### 1B. Community Frameworks & Repos

Read the tracked repos list from `CCEE/Repo-Intelligence/tracked-repos.md` in the Obsidian staging directory. For each repo:
1. Clone or fetch latest (use cached shallow clone, `git fetch --depth 1`)
2. Diff against last-known state cached in `~/.ccee/repo-cache/{repo-name}/`
3. Extract: version, changelog entries, new patterns, architectural decisions
4. Update the cache

**Default mandatory repos (always tracked even if not in Obsidian list):**

| Repo | URL | What to Extract |
|------|-----|-----------------|
| GSD v2 | `github.com/gsd-build/gsd-2` | Context engineering patterns, sub-agent orchestration, wave-based parallelism, fresh-context execution, Nyquist validation |
| GSD v1 (reference) | `github.com/gsd-build/get-shit-done` | Slash command patterns, planning workflow |
| BMAD Method | `github.com/bmad-code-org/BMAD-METHOD` | Agile AI workflow, expansion packs, scale-adaptive intelligence |
| BMAD for Claude Code | `github.com/aj-geddes/claude-code-bmad-skills` | Skill implementations, parallel subagent patterns |
| BMAD Plugin | `github.com/PabloLION/bmad-plugin` | Plugin packaging, marketplace distribution, upstream sync |
| BMAD at Claude | `github.com/24601/BMAD-AT-CLAUDE` | Web builder patterns, bundle strategy |
| Awesome Claude Code | `github.com/hesreallyhim/awesome-claude-code` | New curated tools, skills, workflows |
| Claude Code Everything | `github.com/wesammustafa/Claude-Code-Everything-You-Need-to-Know` | Feature reference, hooks, agent teams, MCP |
| Anthropic Claude Skills | `github.com/anthropics/claude-skills` | Official skill patterns |
| Continuous Claude v2 | Context management, ledger patterns |
| Claude Code PM | Project management workflow patterns |
| Shipyard Plugin | IaC validation, security auditing |
| Claude-Mem | Cross-session memory approaches |
| Local-Review | Parallel code review patterns |
| TDD Guard | Automated TDD enforcement |
| CCPlugins | High-value community plugins |
| ccguard | LOC/complexity constraint enforcement |
| claude-code-auto-memory | Auto-memory plugin patterns |

**Discovery scan:** Search GitHub for repos matching these queries, created/updated in last 7 days, sorted by stars:
- `claude code plugin`, `claude code skills`, `claude code hooks`
- `claude code agents`, `claude code framework`, `claude code workflow`

Filter: repos with >10 stars or from known contributors. Add discoveries to `~/.ccee/runs/{date}/discoveries.json`.

#### 1C. YouTube Intelligence Pipeline

Read the tracked channels list from `CCEE/YouTube-Intelligence/tracked-channels.md`. Also search YouTube for:
- `"claude code" tutorial` — last 7 days, >1000 views
- `"claude code" tips` — last 7 days
- `"claude code" workflow` — last 7 days
- `"claude code" agent` — last 7 days
- `"claude code" plugin` — last 7 days

For each qualifying video:
1. Use `yt-dlp --write-auto-sub --sub-lang en --skip-download` to get transcript
2. If no transcript available, download audio and use Whisper (`whisper --model base --language en`)
3. Send transcript to Claude Code SDK (Sonnet) with extraction prompt:
   - Filter to Claude Code-relevant segments only
   - Extract: title, channel, date, key takeaways, applicable config changes, relevance score (1–10)
4. Deduplicate across videos (multiple videos often cover the same feature)

Write results to `CCEE/YouTube-Intelligence/_weekly-digest.md` and archive to `archive/2026-W{n}.md`.

#### 1D. Intelligence Synthesis

Use Claude Code SDK (Sonnet) to merge all sources into `intelligence-report.json`:
```json
{
  "run_date": "2026-03-23",
  "sources_scanned": 47,
  "official_changes": [...],
  "framework_updates": [...],
  "new_repos_discovered": [...],
  "youtube_intelligence": [...],
  "combined_recommendations": [
    {
      "id": "REC-001",
      "title": "Adopt Agent Teams for parallel CI workflows",
      "source": ["changelog:2.1.50", "youtube:ai-jason-2026-03-20"],
      "scope": "global",
      "impact": "high",
      "risk": "medium",
      "category": "feature_adoption",
      "description": "...",
      "implementation_steps": [...]
    }
  ]
}
```

---

### Phase 2 — VPS Configuration Audit

**Objective:** Build a complete snapshot of the current Claude Code setup and identify gaps, redundancies, and modernisation opportunities.

#### 2A. Configuration Snapshot

Capture the full current state of:

```
~/.claude/                          (global)
~/ccrs/.claude/                     (project)
~/virtual-analyst/.claude/          (project)
~/mission-control/.claude/          (project)
~/social-media-agent/.claude/       (project)
```

For each directory, capture every file: path, size, last modified, SHA-256 hash, parsed structure. Count skills, hooks, agents, commands, rules, MCP servers, plugins.

#### 2B. Feature Coverage Matrix

Generate a matrix comparing current VPS state vs available features. Example:

| Feature | Available Since | VPS Status | Gap? |
|---------|----------------|------------|------|
| Agent Teams | v2.1.50 (Feb 2026) | Not configured | YES |
| Plugin Marketplace | v2.1.45 (Oct 2025) | 1 plugin installed | PARTIAL |
| Voice Mode | v2.1.70 (Mar 2026) | Not enabled | YES |
| /loop command | v2.1.72 (Mar 2026) | Not available | YES |
| Native auto memory | Feb 2026 | Custom implementation | SUPERSEDED |
| HTTP hooks | v2.1.70 | Not configured | YES |
| StopFailure hook | v2.1.68 | Not handled | YES |
| 1M context window | Mar 2026 | Not configured | CHECK |
| Scheduled tasks | Feb 2026 | External cron | REVIEW |
| ... | ... | ... | ... |

#### 2C. Legacy & Redundancy Analysis (Full Authority)

Because CCEE has full restructuring authority, this phase explicitly identifies:

**Superseded implementations:** Custom systems where official features now exist:
- Custom memory persistence hooks → native auto memory?
- Custom persona switching → agent frontmatter with model/tools/memory?
- Custom context bus → Agent Teams with SendMessage?
- External cron scheduling → Claude Code native scheduled tasks?
- Custom skill registry → official plugin marketplace + skills?

**Over-engineered patterns:** Configuration that adds complexity without proportional value:
- Hooks that could be replaced by simpler skill frontmatter
- Rules that duplicate what CLAUDE.md already specifies
- Skills that overlap with built-in or marketplace alternatives

**Scope pollution:** Global configs that should be project-scoped, or vice versa. Repeat of the Social Media Agent rule pollution diagnosis.

**Dead config:** Files that exist but are never triggered or loaded.

For each finding, generate a `removal_proposal` or `replacement_proposal` with:
- What to remove/replace
- What replaces it (if anything)
- Capability delta (what, if anything, is lost)
- Risk rating

#### 2D. Framework Alignment Analysis

Compare against GSD and BMAD best practices:

**GSD alignment:** Fresh-context patterns, wave-based parallelism, externalized state, Nyquist validation, atomic commits
**BMAD alignment:** Role-based agents, 4-phase workflows, scale-adaptive intelligence, expansion packs
**Hybrid assessment:** What to adopt, what to preserve, what's redundant

#### 2E. Scope Classification

Every potential change gets a hard scope tag:

| Scope | Config Path | Rule |
|-------|-------------|------|
| `global` | `~/.claude/` | Generic practices, universal hooks, shared infrastructure |
| `project:{name}` | `~/{project}/.claude/` | Stack-specific skills, project-specific agents |
| `global+project` | Both | Changes requiring coordinated updates |

---

### Phase 3 — Change Proposal Generation

**Objective:** Generate a prioritised, actionable set of changes with full implementation details.

#### 3A. Proposal Categories

```
feature_adoption    — New official Claude Code feature to enable
config_update       — Modify existing configuration
skill_add           — Add new skill
skill_update        — Update existing skill
skill_remove        — Remove superseded or redundant skill
hook_add            — Add new hook
hook_update         — Update existing hook
hook_remove         — Remove superseded or redundant hook
agent_add           — Add new agent definition
agent_replace       — Replace custom agent with better pattern
plugin_install      — Install marketplace plugin
plugin_update       — Update installed plugin
framework_integrate — Adopt pattern from GSD/BMAD/other framework
legacy_removal      — Remove deprecated or superseded configuration
consolidation       — Merge overlapping configurations
security_patch      — Security-related update
performance         — Performance improvement
```

#### 3B. Proposal Structure

Each proposal is self-contained:

```json
{
  "id": "CCEE-2026-W12-001",
  "title": "Replace custom memory hooks with native Auto Memory",
  "category": "legacy_removal",
  "scope": "global",
  "priority": "P1_high",
  "risk": "medium",
  "authority_type": "replacement",
  "replaces": ["hooks/memory-persist.sh", "hooks/memory-recall.sh"],
  "capability_delta": "No loss — native auto memory includes timestamps and staleness detection that our custom system lacks",
  "source_recommendations": ["REC-003", "REC-007"],
  "current_state": {
    "files_affected": ["~/.claude/hooks/memory-persist.sh", "~/.claude/hooks/memory-recall.sh", "~/.claude/settings.json"],
    "current_content_hash": { "memory-persist.sh": "abc123", "memory-recall.sh": "def456" }
  },
  "proposed_changes": [
    { "action": "delete", "path": "~/.claude/hooks/memory-persist.sh" },
    { "action": "delete", "path": "~/.claude/hooks/memory-recall.sh" },
    { "action": "modify", "path": "~/.claude/settings.json", "diff": "..." },
    { "action": "modify", "path": "~/.claude/hooks.json", "diff": "..." }
  ],
  "rollback_procedure": {
    "backup_path": "~/.ccee/backups/2026-W12/",
    "restore_commands": ["cp backup/hooks/memory-persist.sh ~/.claude/hooks/", "..."]
  },
  "testing": {
    "validation_command": "cat ~/.claude/settings.json | jq '.autoMemoryDirectory'",
    "expected_outcome": "~/.claude/auto-memory",
    "smoke_test": "claude -p 'what do you remember about this project?' --max-turns 1"
  },
  "dependencies": [],
  "breaking_changes": false,
  "estimated_impact": "Reduces SessionStart hook latency by ~200ms, gains timestamp-based staleness detection"
}
```

#### 3C. Prioritisation

1. **P0 (Critical):** Security patches, breaking change mitigations, deprecated feature replacements
2. **P1 (High):** Official features that unlock significant capability, legacy removal where official replacement is superior
3. **P2 (Medium):** Community best practices, plugin additions, skill improvements
4. **P3 (Low):** Cosmetic improvements, experimental features, nice-to-haves

#### 3D. Conflict Detection

- Inter-proposal conflicts (two proposals touching the same file)
- Dependency chains (proposal A requires B first)
- Scope collisions (global change that breaks a project override)
- Recent user modifications (files changed by the operator in the last 7 days)

---

### Phase 4 — Sandboxed Testing

#### 4A. Create isolated test environment
```bash
mkdir -p ~/.ccee/test-env/{global,projects}
cp -r ~/.claude/ ~/.ccee/test-env/global/
for project in ccrs virtual-analyst mission-control social-media-agent; do
  cp -r ~/$project/.claude/ ~/.ccee/test-env/projects/$project/
done
```

#### 4B. Apply & validate each proposal in dependency order
- Run validation commands, smoke tests
- Record pass/fail
- Failed proposals are excluded from the review UI

#### 4C. Comparative benchmarks (old vs new)

| Metric | Current | Proposed | Delta |
|--------|---------|----------|-------|
| Skills loaded | 32 | 28 | -4 (consolidated) |
| Hook count | 12 | 10 | -2 (replaced by frontmatter) |
| Config context consumption | ~4,200 tokens | ~3,800 tokens | -400 (leaner) |
| Agent spawn time | N/A | 1.2s | New capability |
| SessionStart latency | 1.8s | 1.1s | -700ms (removed custom hooks) |

---

### Phase 5 — Review UI & API

#### 5A. Web Server

Express server on `localhost:9898`, also accessible via Tailscale at `http://100.88.238.20:9898`.

```
GET  /ccee/review/{date}             → Review UI (single-page app)
GET  /api/ccee/latest                → Latest run summary
GET  /api/ccee/runs                  → All runs
GET  /api/ccee/runs/{date}           → Full run details
GET  /api/ccee/runs/{date}/proposals → All proposals
POST /api/ccee/runs/{date}/apply     → Apply selected proposals
POST /api/ccee/runs/{date}/reject    → Reject proposals
GET  /api/ccee/health                → Health check
GET  /api/ccee/config                → Current tracked config summary
POST /api/ccee/trigger               → Trigger an on-demand run
```

#### 5B. Review UI

Uses Mission Control design system (dark industrial, `--bg-0: #06080c` through `--bg-5: #242b3d`, cyan/green/amber/red accents, DM Sans + JetBrains Mono).

Layout:
- **Left sidebar:** Intelligence summary — source count, video count, repo count, ecosystem health
- **Main panel:** Scrollable proposal cards grouped by priority (P0 → P3). Each card: title, scope badge, risk badge, category tag, source links, expandable diff, accept/reject toggle, dependency warnings. **Removal proposals** have a distinct red-tinted border to draw attention
- **Top bar:** Run date, total proposals, test pass rate, context budget impact
- **Bottom bar:** "Apply Selected", "Export Report", "Defer to Next Week"

Bulk actions: "Accept All P0+P1", "Accept All Tested", "Reject All Removals", "Reject All High Risk"

#### 5C. Mission Control Integration

Mission Control opens `/ccee/review/{date}` in a second browser tab. When changes are applied via the API, Mission Control logs the action in its audit trail. The Skill IR layer is never touched — CCEE operates entirely at Layer 1 (Claude Code adapter level).

---

### Phase 6 — Apply & Document

#### 6A. Backup
```bash
mkdir -p ~/.ccee/backups/{run-date}/
cp -r ~/.claude/ ~/.ccee/backups/{run-date}/global/
for project in ccrs virtual-analyst mission-control social-media-agent; do
  cp -r ~/$project/.claude/ ~/.ccee/backups/{run-date}/$project/
done
```

#### 6B. Atomic Apply
Apply proposals in dependency order. After each: validate, log result. On failure: rollback that proposal + dependents.

#### 6C. Rollback
```bash
ccee rollback {run-date}
ccee rollback {run-date} --proposal CCEE-2026-W12-001
```

#### 6D. Obsidian Documentation Generation

After apply completes, use Claude Code SDK (Opus) to:

1. **Regenerate `current-setup.md`** — full VPS config reference, updated with applied changes
2. **Generate `current-setup.svg`** — full architecture diagram reflecting new state
3. **Generate `before-after.svg`** — visual diff for this week's run
4. **Write `review-summary.md`** — narrative summary of what changed and why (format doubles as GitHub release note)
5. **Update `_index.md`** — dashboard with latest stats and Dataview queries
6. **Regenerate repo README.md** — assembled from User Guide notes + latest architecture diagram
7. **Commit and push** to Git for Obsidian sync

All SVGs follow the Mission Control design tokens (Section 3B). All markdown uses Obsidian-compatible wikilinks and embeds (`![[file.svg]]`).

---

## 5. Project Structure

```
claude-code-evolution-engine/
├── README.md                           (auto-generated from Obsidian User Guide)
├── LICENSE                             (MIT)
├── package.json
├── tsconfig.json
├── .env.example
├── .claude/
│   └── CLAUDE.md                       (project-specific Claude Code context)
├── src/
│   ├── index.ts                        (entry point — orchestrates all phases)
│   ├── config.ts                       (configuration management)
│   ├── sdk.ts                          (Claude Code SDK wrapper — model routing)
│   ├── phases/
│   │   ├── 01-research.ts
│   │   ├── 02-audit.ts
│   │   ├── 03-propose.ts
│   │   ├── 04-test.ts
│   │   ├── 05-review-ui.ts
│   │   └── 06-apply-and-document.ts
│   ├── research/
│   │   ├── changelog-parser.ts
│   │   ├── github-scanner.ts
│   │   ├── youtube-pipeline.ts
│   │   ├── web-scraper.ts
│   │   └── intelligence-merger.ts
│   ├── audit/
│   │   ├── config-snapshot.ts
│   │   ├── feature-matrix.ts
│   │   ├── framework-alignment.ts
│   │   ├── legacy-analyser.ts          (full authority: superseded, redundant, dead config)
│   │   └── scope-classifier.ts
│   ├── proposals/
│   │   ├── generator.ts
│   │   ├── prioritiser.ts
│   │   ├── conflict-detector.ts
│   │   └── dependency-resolver.ts
│   ├── testing/
│   │   ├── sandbox.ts
│   │   ├── validator.ts
│   │   └── benchmarks.ts
│   ├── server/
│   │   ├── app.ts                      (Express server)
│   │   ├── routes/
│   │   │   ├── api.ts
│   │   │   └── ui.ts
│   │   └── public/
│   │       ├── index.html
│   │       ├── styles.css              (Mission Control design system)
│   │       └── app.js
│   ├── apply/
│   │   ├── applier.ts
│   │   ├── backup.ts
│   │   └── rollback.ts
│   ├── obsidian/
│   │   ├── writer.ts                   (write markdown + SVGs to staging dir)
│   │   ├── config-reader.ts            (read tracked repos/channels from Obsidian)
│   │   ├── svg-generator.ts            (SVG diagram generation via SDK)
│   │   ├── readme-assembler.ts         (compose README from User Guide notes)
│   │   └── templates/
│   │       ├── weekly-review.md
│   │       ├── current-setup.md
│   │       └── index-dashboard.md
│   └── utils/
│       ├── git.ts
│       ├── hash.ts
│       ├── logger.ts
│       └── notifications.ts
├── data/
│   ├── default-repos.json              (mandatory repos — always tracked)
│   ├── default-channels.json           (mandatory channels — always tracked)
│   └── feature-registry.json           (known Claude Code features with version metadata)
├── scripts/
│   ├── install.sh                      (setup: deps, cron, systemd, Obsidian folder scaffold)
│   ├── run-weekly.sh
│   └── uninstall.sh
├── tests/
│   ├── research.test.ts
│   ├── audit.test.ts
│   ├── proposals.test.ts
│   ├── apply.test.ts
│   └── obsidian.test.ts
├── docs/
│   ├── ARCHITECTURE.md                 (auto-generated from Obsidian)
│   ├── CHANGELOG.md                    (auto-appended weekly)
│   ├── CONTRIBUTING.md
│   ├── MISSION-CONTROL-INTEGRATION.md
│   └── diagrams/
│       ├── current-setup.svg           (auto-generated)
│       └── latest-before-after.svg     (auto-generated)
└── obsidian-staging/                   (VPS-side staging for Git sync to vault)
    └── CCEE/
        └── ... (mirrors vault structure)
```

---

## 6. Installation

```bash
# Clone
git clone https://github.com/gregdigittal/claude-code-evolution-engine.git
cd claude-code-evolution-engine

# Install dependencies
npm install

# System dependencies
sudo apt install -y yt-dlp ffmpeg
pip install openai-whisper --break-system-packages

# Configure
cp .env.example .env
# Edit .env: VPS paths, GitHub token, Obsidian staging path, notification webhooks

# Scaffold Obsidian folders (creates the vault structure in Section 3A)
./scripts/install.sh --scaffold-obsidian

# First run
npm run ccee:run

# Install cron + systemd service
./scripts/install.sh --cron --systemd
# Cron: 0 2 * * 0 (Sunday 02:00 SAST)
# Systemd: ccee-review.service (Express server on port 9898)
```

---

## 7. Safety & Principles

1. **Never auto-apply changes.** All changes — especially removals — require explicit human acceptance.
2. **Always backup before apply.** No exceptions.
3. **Rollback must work.** Tested as part of Phase 4.
4. **Justify every removal.** Full authority doesn't mean reckless deletion. Every removal must cite what replaces it and confirm no capability loss.
5. **Respect project boundaries.** Global changes must not break project-specific overrides.
6. **Immutable snapshots.** SHA-256 hash every captured state.
7. **Log everything.** Every research hit, every proposal, every decision, every action.
8. **Rate-limit API calls.** Use conditional requests, cache aggressively.
9. **Fair use for transcripts.** Intelligence extraction only, never verbatim redistribution.
10. **Obsidian is the source of truth for documentation.** The repo README is derived from Obsidian, not the other way around.

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Features adopted within 2 weeks of release | >80% of P0+P1 |
| Mean time from release to VPS adoption | <14 days |
| Proposals accepted vs total | Track trend (improving relevance) |
| Rollbacks triggered | <5% of applied changes |
| Context budget trend | Decreasing or stable (CCEE actively fights config bloat) |
| Test pass rate | >95% |
| Weekly run duration | <30 minutes |
| Obsidian docs freshness | Always reflects post-apply state |

---

## 9. Self-Improvement

Each weekly run also:
1. Checks its own repo for updates
2. Assesses whether research sources are still relevant
3. Prunes tracked repos inactive for 90 days
4. Adds trending repos discovered in Phase 1
5. Updates its own CLAUDE.md with lessons learned
6. Tracks its own proposal acceptance rate and tunes prioritisation accordingly

---

*This prompt is the authoritative specification for the Claude Code Evolution Engine. Place it in the project's CLAUDE.md. The first run bootstraps the project; subsequent runs are a self-contained weekly pipeline. Obsidian documentation is the canonical source of truth.*
