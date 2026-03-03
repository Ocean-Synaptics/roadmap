# CLI Surface Audit: roadmap command consolidation

**Date:** 2026-03-03
**Current state:** 41+ top-level commands + 3 sub-CLIs
**Goal:** Reduce to 6 core + 4 named groups (90% surface reduction)

---

## Current Structure

### All Commands (n=41)

#### Execution Loop (6)
- `orient` – batch position (with `--check`, `--ready`, `--next`, `--staged`, `--json`, `--assign`)
- `advance` – next batch
- `describe` – full API surface
- `validate` – check node state
- `show` – inspect node
- `complete` – atomic: claim → checkpoint → reorient → auto-advance
- `commit` – stage node produces, commit with trailer

#### DAG Structure (14)
- `verify` – validate contracts
- `check` – termination test
- `expand` – run expansion script
- `branch` – create git branch with DAG
- `parallel` – show batches (with `--cross-repo`, `--graph`)
- `diff` – structural diff (with `--verbose`)
- `dag` – (already a group with `dag diff`, `dag accept`, `dag reject`)
- `optimize` – refactor DAG
- `propagate` – backward constraint propagation
- `retire` – skip node (with `--cascade`, `--undo`, `--list`)
- `switch` – worktree/branch switch
- `spawn` – create worktree
- `locate` – find all .roadmap/head.json
- `sync` – aggregate tasks
- `merge` – diagnostic artifact connections
- `merge-batch` – DAG consolidation
- `cleanup-worktrees` – remove stale worktrees

#### Multi-Agent Coordination (5)
- `claim` – claim node (with `--owner`, `--ttl`, `--renew`, `--release`, `--list`)
- `dispatch` – route tasks to agents
- `strategy` – proposal/selection/status
- `federation` – cross-repo coordination
- `internal` – (internal tooling)

#### Spec Pipeline (7)
- `plan` – spec planning (with `--gallery`, `--select`, `--status`, `--overlay`, `--schedule`)
- `import` – import from speckit
- `intake` – absorb git range, scan, import, certify, absorb
- `spec` – spec operations (init, generate, compile)
- `spec-kit` – spec-kit integration
- `init` – add clarity gate
- `report` – validation gap report

#### Session Utilities (14)
- `trail` – invocation trail (with `--global`, `--repo`, `--archive`, `--archived`, `--read`)
- `checkpoint` – save/restore state
- `install` – install protocol
- `install-hooks` – install git hooks
- `iter-id` – loop iteration number
- `compile-brief` – generate agent brief
- `compile-prompts` – generate prompts
- `explore` – explore API (with `--api`, `--run`, `--launch`)
- `patch` – branching patches
- `gate` – merge gating
- `env-audit` – check deprecated env vars
- `profile` – audit session profiling
- `audit` – transcript → audit JSON
- `dig` – browse archived files

#### Debugging/Introspection (11)
- `doctor` – health check
- `status` – current state
- `explain` – explain error
- `receipts` – show receipts
- `completion` – shell completion
- `artifacts` – list artifacts
- `remaining` – nodes to completion
- `gallery` – explain debugging
- `blend` – single explain
- `contract` – constraint contract
- `help` – this message

#### Internal/Dead Code (6)
- `position` – alias for orient (adds confusion)
- `iter-id` – loop iteration (machine-only)
- `verify`, `check` – internal validation
- `certify`, `scaffold` – never wired
- `token`, `mf` – internal tooling
- `contact`, `patch` – dead/minimal usage
- `schedule`, `cluster` – spec sub-commands
- `profile`, `audit` – internal tooling

---

## Proposed Structure

### Core (no prefix) — Execution loop + state query

```
roadmap orient [--ready|--next|--assign]   ← where am I
roadmap show <id>                           ← inspect node
roadmap complete <id>                       ← done with node
roadmap advance                             ← next batch
roadmap chart [--deps|--critical-path]      ← progress
roadmap validate [<id>]                     ← check state
```

**Rationale:** These 6 commands are the mainline. Users must learn them first. No prefixes.

---

### `roadmap dag` — DAG structure and manipulation

```
roadmap dag diff [<ref>]      ← was: diff
roadmap dag expand <script>   ← was: expand
roadmap dag propagate         ← was: propagate
roadmap dag retire <id>       ← was: retire [--cascade|--undo]
roadmap dag optimize          ← was: optimize
roadmap dag switch            ← was: switch (worktree)
roadmap dag spawn <id>        ← was: spawn
```

**Rationale:** All DAG-level operations grouped. One mental model: "dag" prefix = structural changes.

**Removed from dag group:**
- `verify`, `check`, `branch`, `parallel`, `parallel --cross-repo`, `locate`, `sync`, `merge`, `merge-batch`, `cleanup-worktrees` → move to internal or `util` sub-commands
- `position` → alias removed (confusing); use `orient`

---

### `roadmap team` — Multi-agent coordination

```
roadmap team assign [--owners w1,w2]   ← was: orient --assign (promoted)
roadmap team claim <id>                 ← was: claim
roadmap team dispatch                   ← was: dispatch
roadmap team strategy                   ← was: strategy
```

**Rationale:** All multi-worker commands. Clear namespace for swarm mode.

---

### `roadmap spec` — Spec intake pipeline

```
roadmap spec plan [--gallery|--select]  ← was: plan
roadmap spec import [--from speckit]    ← was: import
roadmap spec intake [absorb|scan]       ← was: intake
roadmap spec compile                    ← was: spec compile
```

**Rationale:** Unified spec operations. One entry for all spec-related workflows.

**Removed:**
- `plan --schedule`, `plan --overlay` → revert to `roadmap expand --gallery` if needed
- `init <dag-id>` → move to `roadmap util` or keep as standalone (rarely used)
- `spec init` → promoted to `roadmap spec init`

---

### `roadmap util` — Session utilities & introspection

```
roadmap util trail [--global|--repo]     ← was: trail
roadmap util checkpoint [--list|--restore] ← was: checkpoint
roadmap util explore [--api|--run]       ← was: explore
roadmap util install [path]              ← was: install, install-hooks
roadmap util federation                  ← was: federation
roadmap util health [--check]            ← new: collapse doctor/status/remaining/receipts/artifacts
```

**Rationale:** One prefix for everything off-path. Session state, debugging, and tooling.

---

## Removals (Dead Weight)

| Command | Reason | Migrate To |
|---------|--------|-----------|
| `position` | Alias for `orient`, adds confusion | Delete (use `orient`) |
| `describe` | Superseded by `show` + `chart` | Delete |
| `verify`, `check` | Internal validation, rarely called directly | Internal only |
| `parallel` | Redundant with `chart` | Delete (use `chart`) |
| `locate`, `sync` | Internal discovery; not user-facing | Move to internal or scripts |
| `iter-id` | Machine-only; move to `mf` (internal) | Internal only |
| `gallery`, `blend`, `explain` | Single-issue debugging artifacts | Delete |
| `compile-brief`, `compile-prompts` | `mf` internal, not user-facing | Internal only |
| `env-audit` | Move to `util install --check` | Consolidate |
| `doctor`, `status`, `remaining`, `receipts`, `artifacts` | Collapse into `util health` | Consolidate |
| `cli-repairs.ts` exports | Dead code, never wired | Delete |
| `contract`, `gate`, `patch`, `report`, `certify`, `scaffold` | Move to `dag` or `spec` sub-groups or delete | Evaluate per-item |
| `audit`, `profile` | Internal; move to `mf audit` | Internal only |
| `token`, `mf` | Internal coordination tooling | Internal only |
| `schedule`, `cluster` | Spec sub-commands; consolidate into `spec plan` | Consolidate |
| `internal` | Never user-facing | Delete |
| `init` | Rarely used; collapse into `spec init` or delete | Evaluate |

---

## File Changes

| File | Change | Produces |
|------|--------|----------|
| `bin/roadmap.ts` | Add group dispatch; redirect old spellings with deprecation notice | bin/roadmap.ts (refactored) |
| `docs/CLI-REFERENCE.md` | New canonical reference | docs/CLI-REFERENCE.md (new) |
| `tests/cli-surface.test.ts` | Smoke-test every old/new invocation pattern | tests/cli-surface.test.ts (new) |
| `.claude/CLAUDE.md` | Update session protocol examples to new spelling | .claude/CLAUDE.md (updated) |

---

## Verification

### Help Size
- **Current:** ~120 lines
- **Target:** <40 lines
- **Measure:** `bin/roadmap help | wc -l`

### Backward Compatibility
- Old commands still work with deprecation notice
- No data loss; all functionality preserved
- Smooth migration path for agents and scripts

### Test Coverage
- Smoke-test: all old commands redirect or work as-is
- New surface: `roadmap dag diff`, `roadmap team assign`, `roadmap spec plan`, `roadmap util trail`
- Help output: sanity check help text size

---

## Migration Path

**For users:**
1. Old commands still work (e.g., `roadmap parallel`)
2. Deprecation notice printed: "⚠️  roadmap parallel is deprecated. Use `roadmap chart` instead."
3. Update scripts/docs to use new spellings (e.g., `roadmap chart` instead of `roadmap parallel`)

**For agents:**
1. Sealed brief updates: no agent-visible change (routing happens in CLI)
2. Prompt injection: update examples in `.claude/CLAUDE.md` to use new spellings

---

## Summary

| Metric | Current | Proposed | Reduction |
|--------|---------|----------|-----------|
| Top-level commands | 41+ | 6 | -85% |
| Help output lines | ~120 | <40 | -67% |
| Conceptual groups | implicit (sprawled) | 4 named groups | +clarity |
| Sub-commands (dag+team+spec+util) | scattered | ~30 organized | +findability |
| Dead code | ~15 commands | removed | 0 |
| Backward compat | N/A | 100% with notices | +stability |

