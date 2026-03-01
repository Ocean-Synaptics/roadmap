# CLI Output Audit — Specification

## Definitions

- **stdout**: `process.stdout`. Reserved for exactly one JSON envelope per invocation.
- **stderr**: `process.stderr`. All human-readable text (progress bars, emoji charts, diagnostics).
- **JSON envelope**: `CliEnvelope` from `cli-envelope.ts` — `{ schema_version, ok, cmd, repoRoot, headSha, data?, render?, error? }`.
- **render.body**: `RenderV1.body` field in the envelope — plain-text human summary for LLM display.
- **RenderModel**: Structured render tree from `src/lib/render/index.ts` — drives both `render.body` and stderr output.
- **Stateful command**: Any command that reads or mutates DAG state: `orient`, `advance`, `validate`, `complete`, `chart`, `doctor`, `remaining`, `status`, `plan status`, `plan gallery`, `plan select`, `certify`, `checkpoint`.

## Requirements

### R1: stdout is always clean JSON

Every CLI command emits exactly one `CliEnvelope` JSON object to stdout. No other output (human text, progress bars, emoji, blank lines) may appear on stdout.

**Exception**: `--human` flag explicitly opts into human-only stdout (no JSON). This is the only exception.

### R2: human text always goes to stderr

All human-readable output (progress bars, diagnostic tables, chart grids, status summaries) is written to `process.stderr`, never `process.stdout`. The `json()` function in `bin/roadmap.ts` already implements this — all commands must route through it.

### R3: render.body populated for all stateful commands

Every stateful command passes a `RenderModel` to `json()`, which populates `render.body` in the envelope. The `RenderModel` produces a plain-text summary suitable for verbatim LLM display.

Commands requiring `RenderModel` integration:
| Command | Existing renderer | Status |
|---------|------------------|--------|
| orient | `renderOrient` | Done — has RenderModel |
| chart | `renderChart` | Partial — RenderModel only on `--json` path |
| advance | — | Missing |
| complete | — | Missing |
| validate | `renderValidate` | Missing RenderModel |
| doctor | `renderDoctor` | Missing RenderModel |
| remaining | `renderRemaining` | Missing RenderModel |
| status | — | Missing |
| plan gallery | `renderPlanGallery` | Missing RenderModel |
| plan select | `renderPlanSelect` | Missing RenderModel |
| plan status | `renderPlanStatus` | Missing RenderModel |
| certify | — | Missing |

### R4: zero console.log in command functions

All `console.log()` calls in `bin/roadmap.ts` command functions (`cmdChart`, `cmdDoctor`, `cmdRemaining`, and any others) are removed. The `json()` function handles both stderr rendering and stdout JSON emission.

### R5: receipt enforcement scoped

`audit-metaflow.ts` receipt checks (self-insert, surface-header) apply only to commands in `ELIGIBLE_COMMANDS`. Non-eligible commands are exempt. This is already partially implemented but must be verified complete.

## Acceptance Scenarios

### S1: chart stdout is clean JSON
```
Given: a repo with an active roadmap
When: `roadmap chart --note "test"` is run
Then: stdout contains exactly one valid JSON object (parseable by `jq .`)
And: the JSON object has `schema_version`, `ok`, `cmd`, `data`, `render` fields
And: `render.body` contains the chart text (progress bars, batch grid)
And: stderr contains the human-readable chart output
```

### S2: doctor stdout is clean JSON
```
Given: a repo with an active roadmap
When: `roadmap doctor completion` is run
Then: stdout contains exactly one valid JSON object
And: `render.body` contains the diagnostic summary
And: stderr contains the human-readable diagnostics
```

### S3: remaining stdout is clean JSON
```
Given: a repo with remaining nodes
When: `roadmap remaining` is run
Then: stdout contains exactly one valid JSON object
And: `render.body` contains the remaining nodes list
And: stderr contains the human-readable remaining output
```

### S4: orient stdout unchanged (regression)
```
Given: a repo with an active roadmap
When: `roadmap orient --note "test"` is run
Then: stdout contains exactly one valid JSON object with `render.body`
And: behavior is identical to current (orient already correct)
```

### S5: advance populates render.body
```
Given: a repo with a complete batch
When: `roadmap advance --note "test"` is run
Then: stdout JSON envelope contains `render.body` with position summary
```

### S6: complete populates render.body
```
Given: a completed node with passing validation
When: `roadmap complete <node> --note "test"` is run
Then: stdout JSON envelope contains `render.body` with completion summary
```

### S7: validate populates render.body
```
Given: a repo with an active roadmap
When: `roadmap validate --note "test"` is run
Then: stdout JSON envelope contains `render.body` with validation results
```

### S8: plan commands populate render.body
```
Given: a repo with plan candidates
When: `roadmap plan --gallery --note "test"` is run
Then: stdout JSON envelope contains `render.body` with gallery table
When: `roadmap plan status` is run
Then: stdout JSON envelope contains `render.body` with plan status
```

### S9: pipe through jq succeeds for all stateful commands
```
Given: a repo with an active roadmap
When: any stateful command is piped through `jq .`
Then: jq exits 0 (valid JSON)
And: `jq -r '.render.body'` produces non-empty human-readable text
```

### S10: --human flag still works
```
Given: any command supporting --human
When: run with `--human`
Then: stdout contains human-readable text only (no JSON)
And: stderr is empty or contains the same human text
```
