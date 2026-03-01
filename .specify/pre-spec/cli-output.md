# CLI Output Audit — Pre-spec

## Problem

The CLI has two interleaved output failures:

### P1: stdout pollution — human text mixed with JSON

Commands `chart`, `doctor`, `remaining` write human-readable text via `console.log()` to **stdout**, then also emit a JSON envelope to stdout. Machine consumers (piped through `jq`, consumed by agents) receive unparseable mixed output.

**Current state** (`bin/roadmap.ts`):
- `cmdChart()` (L1408-1549): 40+ `console.log()` calls writing progress bars, emoji legends, batch grids — all to stdout. JSON envelope emitted conditionally at L1552-1578 only when `--json` is passed, but the `console.log` output has already been written.
- `cmdDoctor()` (L1581-1678): `console.log()` for diagnostics when `--json` is not passed. When `--json` IS passed, uses `json()` correctly — but the default path pollutes stdout.
- `cmdRemaining()` (L1680-1735): Same pattern — `console.log()` default, `--json` flag for structured output.

**Correct pattern** (`json()` at L6281-6316):
- Human render goes to `process.stderr` (L6294)
- JSON envelope goes to `process.stdout` via `emit()` (L6314)
- `RenderV1` attached to envelope for LLM consumption

The `json()` function already implements the correct pattern. The offending commands bypass it.

### P2: render.body absent from most stateful commands

`render.body` in the JSON envelope is the highest-leverage display nudge for LLMs — a pre-formatted human-readable summary that any LLM can copy verbatim into its response. Currently only `orient` and `chart` (when `--json` is passed) populate a `RenderModel`. All other stateful commands (`advance`, `complete`, `validate`, `doctor`, `remaining`, `status`, `plan status`, `plan gallery`, `plan select`) emit JSON without `render.body`.

Human renderers already exist in `src/lib/cli-human.ts` for: orient, chart, plan-gallery, plan-select, plan-status, doctor, validate, trail, remaining. These are unused — the commands either inline their own `console.log` or skip human rendering entirely.

### P3: receipt system scope

The metaflow receipt system (`src/lib/cli/audit-metaflow.ts`) proves "LLM showed rich output" via self-insert and surface-header receipts per command. This is a compliance proxy — it can verify that a receipt was written but cannot enforce that the LLM actually displayed the content to the user. The real lever is `render.body` being prominent and correct, making display the path of least resistance. Receipt checks should scope to `mf` commands only, not gate all CLI operations.

## Desired State

1. **stdout = clean JSON always.** Every command emits exactly one JSON envelope to stdout (via `emit()`). Zero `console.log()` calls remain in `bin/roadmap.ts` command functions. Human text goes to stderr only.
2. **render.body populated for all stateful commands.** Every command that reads or mutates DAG state passes a `RenderModel` to `json()`. The existing `cli-human.ts` renderers supply the content.
3. **cli-human.ts renderers wired to commands.** The renderers exist but are disconnected. Each command builds a `RenderModel` from its data structure and passes it to `json()`.
4. **Receipt enforcement scoped to mf commands.** `audit-metaflow.ts` checks apply only to metaflow-eligible commands, not the full command set.

## Constraints

- `emit()` in `cli-envelope.ts` is the single output funnel — do not add alternative paths
- `json()` in `bin/roadmap.ts` already correctly routes human→stderr, JSON→stdout — use it for all commands
- `RenderModel` from `src/lib/render/index.ts` is the structured format — build models using its node types
- `cli-human.ts` renderers produce plain text — they feed `RenderV1.body`, not stdout
- Backward compatibility: `--human` flag on `emit()` must still work (writes human text to stdout, no JSON)
- No new dependencies
