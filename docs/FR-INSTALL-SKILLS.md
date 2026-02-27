# FR: `roadmap install --skills` — protocol enforcement via skills, not prose

## Problem

`roadmap install` writes behavioral protocol into CLAUDE.md as prose. Agents read it, sometimes follow it. The protocol block is ~120 lines of instructions covering session lifecycle, commit discipline, swarm preamble, adversarial review, elicitation, expansion — all as "you should" text that competes with the agent's other instructions and context pressure.

Evidence from two iterations:

| Iteration | Agents | Protocol violations observed | Root cause |
|---|---|---|---|
| 1 | 99 | Agents skipped orient, committed without node trailers, explored upstream beyond consumes | CLAUDE.md instructions drowned by task context |
| 2 | 20 | Fewer violations (Opus spine helped) but still: chart summarized instead of reprinted, orient notes were ceremonial | Prose enforcement degrades under context pressure |

The protocol is procedural — it's a sequence of tool calls with specific arguments. Procedural enforcement belongs in skills (executable tool calls), not in prose (hope-based compliance).

Separately: the user's global `~/.claude/CLAUDE.md` contains behavioral constraints (language density, code style, evidence requirements, meta-prompt discipline, retry policy) that apply to every agent in every project. These are currently loaded as system prompt text. They should be exportable as a skill — a single artifact that `roadmap install` can place into any project, ensuring every agent spawned in that project inherits the constraints without the user manually copying CLAUDE.md content.

## Proposal

### `roadmap install --skills`

Installs `.claude/commands/` skills that mechanically enforce the roadmap protocol. Each skill wraps a protocol phase as an executable sequence — the agent calls the skill instead of reading prose and assembling CLI calls.

```bash
roadmap install --skills                    # install protocol skills to .claude/commands/
roadmap install --skills --target <path>    # custom target directory
roadmap install --skills --constraints ~/.claude/CLAUDE.md  # also export behavioral constraints as a skill
```

### Skills installed

| Skill | Replaces (CLAUDE.md section) | What it does |
|---|---|---|
| `roadmap-start.md` | Session protocol → Start | Runs `orient --note` + `chart`, returns structured position + chart output |
| `roadmap-work.md` | Execute loop → show + read | Runs `show <node>`, assembles work brief from produces/consumes/validate/ambient, returns self-contained context |
| `roadmap-done.md` | Execute loop → commit + complete | Validates produces exist, `git add` produces only, `commit --node`, `complete`, returns validation result |
| `roadmap-dispatch.md` | Orchestrator dispatch protocol | Runs `orient --assign`, optionally `compile-prompts` (when available), returns agent→node assignments |
| `roadmap-review.md` | Adversarial review | Runs three-pass adversarial review (fool/inquisitor/griffinProxy) against a proposed DAG, returns structured verdict |
| `roadmap-constraints.md` | User's global CLAUDE.md | Behavioral constraints as a referenceable skill — language, code style, evidence, retry policy |
| `roadmap-gallery.md` | — (new) | Emoji-rich cross-roadmap parity display + AskUserQuestion for triage |
| `roadmap-progress.md` | Chart reprint convention | Emoji-rich chart display + AskUserQuestion for steering |

### Skill anatomy

Each skill is a `.claude/commands/` markdown file. Format:

```markdown
# /roadmap-start

Start a roadmap-governed session. Run this before any state-mutating work.

## Arguments
- `intent` (required): What you're doing and why. This becomes the orient --note.

## Steps
1. Run: `$ROADMAP_BIN orient --note "$intent"`
2. Run: `$ROADMAP_BIN chart`
3. Return the chart output verbatim — do not summarize, paraphrase, or truncate.

## Contract
- Position comes from orient, not memory. This call is canonical.
- If orient returns `position: "untracked"`, the breadcrumb still records globally.
- After this skill completes, you know: position[], level, produces[], consumes[], batchRemaining[].
```

`$ROADMAP_BIN` is resolved at install time to the absolute path (same as current `install` behavior).

### `roadmap-work` — the brief assembler

This is the skill-native form of `compile-prompts` for single-agent use. Multi-agent dispatch uses `roadmap-dispatch` which calls `compile-prompts` when available.

```markdown
# /roadmap-work

Get the work brief for a node. Run this before implementing.

## Arguments
- `node` (required): Node ID to work on.

## Steps
1. Run: `$ROADMAP_BIN show $node` → parse JSON
2. Present to agent:
   - **Produces**: files to create/modify (these are your only write targets)
   - **Consumes**: files to read (these are your only read inputs in swarm mode)
   - **Ambient**: shared context available but not a dependency
   - **Validate**: commands that will run on `complete` — check these before submitting
   - **Desc**: what this node does
3. Read each file in `consumes` and present content.
4. If `ambient` paths exist, list them (do not read unless agent requests).

## Contract
- In swarm mode: read ONLY consumes files. Nothing else.
- Produces are your exclusive write targets. No other agent writes these files.
- Validate is your acceptance test. Run these locally before calling /roadmap-done.
```

### `roadmap-done` — atomic close

```markdown
# /roadmap-done

Submit completed work for a node. Commits produces and runs validation.

## Arguments
- `node` (required): Node ID to complete.
- `message` (required): What was produced (becomes commit message).

## Steps
1. Run: `$ROADMAP_BIN show $node` → get produces[]
2. For each path in produces[]: verify file exists. If missing, STOP and report which produces are missing.
3. Run: `git add <produces files only>` — never git add . or git add -A
4. Run: `git commit -m "$node: $message"`
5. Run: `$ROADMAP_BIN complete $node --note "$message"`
6. If complete rejects: return the ValidationResult. Do not retry automatically.
7. If complete succeeds: return checkpoint ID + unblocked nodes.

## Contract
- Commit per node, before complete.
- git add only files in produces — exclusive ownership.
- If complete rejects, the commit stands. Fix, commit again, call /roadmap-done again.
- Never --skip-validate unless user explicitly instructs.
```

### `roadmap-constraints` — behavioral export

The user's `~/.claude/CLAUDE.md` contains sections that are project-agnostic behavioral constraints. `roadmap install --skills --constraints <path>` extracts these into a skill:

```bash
roadmap install --skills --constraints ~/.claude/CLAUDE.md
```

**Extraction logic:**
1. Read the source CLAUDE.md
2. Extract sections that are behavioral (not project-specific): Identity, Language, Structure, Evidence, Code, Meta, Stance, Retry
3. Exclude sections that are project-specific: Roadmap (replaced by skills), Regent (environment-specific), Roadmap Protocol (replaced by skills)
4. Write to `.claude/commands/roadmap-constraints.md`

The constraints skill is referenced, not inlined — agents see it as an available command. The skill content is the behavioral contract:

```markdown
# /roadmap-constraints

Behavioral constraints for all agents in this project. Reference this before producing any output.

## Language
- Concrete, declarative, load-bearing, dense
- Peer engineer: no simplification, no hand-holding
...

## Code
- Guards: exit on failure, don't wrap success path
- One nesting level max
...

## Evidence
- Trail or refuse
- Line numbers, traces, identifiers
- No placeholders
```

### `roadmap-gallery` — cross-roadmap triage

The gallery skill transforms the flat parity table from `roadmap gallery` into an emoji-rich visual dashboard and follows it with an `AskUserQuestion` so the user can steer what happens next. This turns a passive status dump into an interactive decision point.

```markdown
# /roadmap-gallery

Display cross-roadmap parity gallery and ask the user what to act on.

## Steps
1. Run: `$ROADMAP_BIN gallery` (or `roadmap locate --all` + per-roadmap `chart`)
2. For each discovered roadmap, render a visual block:

   ```
   ## 🗺️ demo-orchestration
   ████████████████████████████░ 98% (124/126)
   🟢 full parity on 124 nodes
   🔴 2 gaps: DO.B.4 (test coverage), DO.C.5 (launch-check)
   📅 last activity: 2h ago

   ## 🗺️ fusion
   ████░░░░░░░░░░░░░░░░░░░░░░░ 17% (7/41)
   🟡 partial — 34 nodes remaining
   🔥 active batch: L02 (3 nodes)
   📅 last activity: 45m ago

   ## 🗺️ todo-app-iter2
   █████████████████████████████ 100% (28/28)
   🟢 converged
   📅 last activity: 12m ago
   ```

3. Call AskUserQuestion with options derived from the gallery state:

   Question: "Which roadmap do you want to work on?"
   Options built dynamically:
   - For roadmaps with gaps: "$name — close $N gaps" (description: list the gap node IDs)
   - For roadmaps with active batches: "$name — continue L$level ($N nodes)"
   - For converged roadmaps: "$name — review / start next iteration"
   - Always include: "Overview only — no action"

## Contract
- Gallery output is visual-first. Dense tables are for CLI; skills are for humans.
- AskUserQuestion options are derived from state, not hardcoded. A roadmap with 0 gaps doesn't get a "close gaps" option.
- The user's selection determines the next skill call. Selection of a roadmap with gaps → `/roadmap-work` on the first gap node. Selection of an active batch → `/roadmap-start` scoped to that roadmap.
```

**Why AskUserQuestion matters here:** Without it, the gallery is informational — the user reads it, then types what they want. With it, the gallery is transactional — the user sees state and picks an action in one step. The cognitive load drops from "interpret table + formulate command" to "read display + click option."

### `roadmap-progress` — intermittent steering checkpoint

The progress skill is the interactive version of `chart`. Called periodically during long sessions (after completing a node, after a batch closes, on session resume). Renders the chart with emoji enrichment and asks the user if they want to continue, pivot, or stop.

```markdown
# /roadmap-progress

Display current roadmap progress and ask the user how to proceed.

## Arguments
- `roadmap` (optional): Specific roadmap to check. Defaults to current repo's DAG.

## Steps
1. Run: `$ROADMAP_BIN orient --check` → get position, level, done, remaining, batchComplete
2. Run: `$ROADMAP_BIN chart`
3. Compute session context:
   - Nodes completed this session (from trail --last)
   - Time since session start
   - Current batch status (N/M complete)
4. Render enriched display:

   ```
   ## 📊 todo-app-iter2 — Session Progress

   █████████████████████████░░░░ 82% (23/28)
   📍 Level 7 — component batch
   ⏱️ 34m elapsed · 8 nodes completed this session
   📦 Current batch: 2/4 complete (component-todolist, component-todoitem done)
   ⏳ Remaining: component-titlebar, component-themetoggle

   ### This session
   ✅ L04 config-build, config-lint, config-test (3m)
   ✅ L05 electron-db, renderer-store (8m)
   ✅ L06 electron-main, renderer-entry (12m)
   🔄 L07 2/4 in progress...
   ```

5. Call AskUserQuestion with context-appropriate options:

   If batch in progress:
   - "Continue — finish current batch" (recommended)
   - "Skip to integration — retire remaining L07, advance"
   - "Pause — archive trail, resume later"
   - "Pivot — show gallery for other roadmaps"

   If batch just completed:
   - "Continue — start next batch (L08: test-components)"
   - "Review — inspect completed nodes before advancing"
   - "Pause — archive trail, resume later"
   - "Pivot — show gallery for other roadmaps"

   If DAG complete:
   - "Archive — trail --archive, session done"
   - "Iterate — plan next iteration"
   - "Gallery — check other roadmaps"

## Contract
- Call this skill after every batch completion and at minimum every 30 minutes of active work.
- The user's selection is binding. "Pause" means archive and stop. "Pivot" means switch roadmaps. "Skip" means retire nodes.
- Never call this skill more than once per node completion — it's a checkpoint, not a status bar.
- Session metrics (elapsed time, nodes completed) come from trail, not from memory or estimation.
```

**When to invoke:** The CLAUDE.md pointer table instructs agents to call `/roadmap-progress` at natural breakpoints:
- After `roadmap-done` closes the last node in a batch
- On session resume (after `/roadmap-start`)
- When the agent has been working for >30 minutes without user interaction
- When the user asks "where are we?" or similar

The skill replaces the current "reprint chart verbatim" instruction with something that actually engages the user. Chart reprinting was correct (don't lose information) but passive (user has to parse ASCII and decide what's next). The progress skill preserves the information density and adds a decision interface.

### What happens to CLAUDE.md

CLAUDE.md shrinks. The `<!-- ROADMAP-PROTOCOL-START -->` block is replaced with:

```markdown
<!-- ROADMAP-PROTOCOL-START -->
## Roadmap Protocol

This project uses roadmap-governed execution via skills. Do not run roadmap CLI directly.

| Phase | Skill | When |
|---|---|---|
| Session start | `/roadmap-start` | Before any state-mutating work |
| Get work brief | `/roadmap-work <node>` | Before implementing a node |
| Submit work | `/roadmap-done <node>` | After implementing produces |
| Dispatch swarm | `/roadmap-dispatch` | Before spawning workers |
| Review DAG | `/roadmap-review` | Before committing DAG changes |
| Cross-roadmap triage | `/roadmap-gallery` | To see all roadmaps + pick what to work on |
| Progress checkpoint | `/roadmap-progress` | After batch close, on resume, every ~30min |
| Behavioral constraints | `/roadmap-constraints` | Reference for output standards |

Position comes from `/roadmap-start`, not memory. Never infer position.
Progress checkpoints use `/roadmap-progress` — interactive steering, not passive chart dumps.
<!-- ROADMAP-PROTOCOL-END -->
```

~120 lines → ~15 lines. The behavioral content moved into executable skills.

### Install modes

```bash
# Full install: skills + slim CLAUDE.md + hooks
roadmap install --skills --hooks

# Skills only (no CLAUDE.md modification)
roadmap install --skills --no-claude-md

# Legacy mode (current behavior, prose in CLAUDE.md)
roadmap install

# With behavioral constraint export
roadmap install --skills --constraints ~/.claude/CLAUDE.md

# Update skills (re-export from latest roadmap version)
roadmap install --skills --update
```

`--skills` and legacy mode are mutually exclusive for the protocol section. If `--skills` is used, the CLAUDE.md protocol block becomes the slim pointer table. If legacy `install` is used, the full prose block is written (backward compatible).

### Staleness detection

Skills embed a version hash from the roadmap package:

```markdown
<!-- roadmap-skill-version: abc123 -->
```

`roadmap install --skills --check` compares installed skill versions against current package version. Reports stale skills without modifying them.

## Integration with compile-prompts

`roadmap-dispatch` is the skill-native orchestration entry point. When `compile-prompts` ships (FR-COMPILE-PROMPTS), dispatch gains prompt compilation:

```markdown
# /roadmap-dispatch (after compile-prompts ships)

## Steps
1. Run: `$ROADMAP_BIN orient --assign --owners $owners --note "$intent"`
2. Run: `$ROADMAP_BIN compile-prompts --env environment.md --batch current`
3. For each assignment: return { nodeId, owner, promptPath }
4. Orchestrator spawns agents with: `Task(prompt: read(promptPath))`
```

Before compile-prompts ships, dispatch uses the simpler `roadmap-work` brief per node.

## Integration order

1. **install --skills** — foundation. Skills exist, CLAUDE.md slims down. Agents start using `/roadmap-start`, `/roadmap-work`, `/roadmap-done`.
2. **compile-prompts** (FR-COMPILE-PROMPTS) — `/roadmap-dispatch` gains prompt compilation backend.
3. **runtime-explore** (FR-RUNTIME-EXPLORE) — `/roadmap-done` validation gains CDP-based behavioral checks.
4. **emit-gallery** (FR-EMIT-GALLERY) — new `/roadmap-emit` skill wrapping gallery pipeline.
5. **plan-gallery** (FR-PLAN-GALLERY) — new `/roadmap-plan` skill wrapping DAG template selection.

Each FR adds a skill. The skill is the user-facing surface; the CLI command is the backend. `roadmap install --skills --update` re-exports all skills from the latest version.

## Invariants

- Skills are deterministic: same roadmap version → same skill content (modulo `$ROADMAP_BIN` path)
- Skills never bypass validation. `/roadmap-done` always calls `complete` which always runs `validate[]`
- Behavioral constraints are extracted, not generated. The skill contains the user's exact words, not a paraphrase.
- Skills are additive — installing skills does not remove the ability to use CLI directly. The CLAUDE.md pointer says "do not run CLI directly" but this is advisory, not enforced. Enforcement (if desired) is a hooks concern, not a skills concern.
- `install --skills` is idempotent. Running it twice produces the same result.

## Scope

- Modify: `bin/roadmap.ts` — `install` command gains `--skills`, `--constraints`, `--no-claude-md`, `--update`, `--check` flags
- New: `src/lib/install-skills.ts` — skill template engine, constraint extractor, version embedding
- New: `src/skills/` — skill templates (roadmap-start, roadmap-work, roadmap-done, roadmap-dispatch, roadmap-review, roadmap-gallery, roadmap-progress)
- Modify: existing `cmdInstall()` — slim CLAUDE.md protocol block when `--skills` is used
- Tests: idempotency, version hashing, constraint extraction, CLAUDE.md protocol block replacement, `$ROADMAP_BIN` resolution

## Not in scope

- Hook-based enforcement of "don't use CLI directly" — advisory only, hooks are a separate concern
- Skill parameterization beyond `$ROADMAP_BIN` — future (model-specific skill variants)
- Auto-detection of user's CLAUDE.md location — `--constraints` requires explicit path
- Skill composition (one skill calling another) — each skill is self-contained
