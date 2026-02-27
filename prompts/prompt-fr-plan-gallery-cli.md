# Add `roadmap plan --gallery` command to bin/roadmap.ts.

New command: plan --gallery [--from <specFile>] [--select <id>] [--evaluate <json>] [--json]

Handler cmdPlanGallery():
  1. Parse --from <specFile> (defaults to first .specify/specs/**/*.md found, or empty string)
  2. Parse --select <id> to commit a previously-generated candidate
  3. Parse --evaluate <json> for LLM judgment (same Judgment schema as complete --evaluate)
  4. If no --select and no --evaluate:
     a. Call buildGallery(specSource, repoRoot + "/.roadmap/evaluations")
     b. Render ASCII table comparison (id, nodes, wallClockMinutes, costUSD, risk)
     c. Show topology diagram per candidate (compact: "emit → compile ─┬─ test ─┬─ runtime")
     d. Show recommendation (lowest risk)
     e. Output "Select [A/B/C/D]:"
  5. If --evaluate <json>:
     a. Parse Judgment[] from json
     b. Validate confidence >= 0.7 (minimum bar for plan selection)
     c. Record to .roadmap/evaluations/plan-selection.jsonl with phase: "plan-selection:<runId>"
     d. Write selected candidate dag as .roadmap/head.json (AFTER backing up existing as .roadmap/head-prev.json)
     e. Output: { selected: id, committed: true, headPath: ".roadmap/head.json" }
  6. If --select <id>: same as --evaluate but without confidence requirement (manual override)

Wire in main switch: case "plan": if (args.includes("--gallery")) ...

Import buildGallery from src/lib/gallery-templates/index.ts
Import estimateCost from src/lib/cost-estimator.ts

After adding the command, run: npx tsc --noEmit to verify no type errors.

## Context

**Domain**: fr-predicates

**Files to read**:
- `src/lib/gallery.ts`
- `src/lib/gallery-templates/index.ts`
- `src/lib/cost-estimator.ts`

**Constraints**:
- `src/protocol.ts` is the core. Additive changes only — existing types must not change shape.
- `bin/roadmap.ts` is the sole CLI entry. All commands are functions named `cmdXxx(note: string)`. Each is registered in the main `switch` on `cmd`. Imports go at top of file.
- `src/lib/*.ts` are library modules. They import from `../protocol.ts` and each other. No circular imports.
- Tests import from `src/` and `src/lib/`. No test imports from `bin/`.
- Pre-commit hook enforces: commit message must reference a node ID or use `roadmap:` prefix. Bypass: `SKIP_NODE_CHECK='reason' git commit`.

**High-entropy zones**:
**`bin/roadmap.ts`** (~2500 lines) — the most fragile file. Adding a command requires:
1. Add import at top (after existing imports, grouped logically)
2. Add `async function cmdXxx(note: string)` implementation
3. Add `case 'xxx': return await cmdXxx(note!)` in main switch (around line 150-200)
4. Run `npx tsc --noEmit` immediately after — this file has strict type checking

**`src/protocol.ts`** — additive only. Changing any exported type signature breaks downstream consumers without a compile error in this file.

**Entities**:
- `Graph<T>` — typed DAG with nodes, init, term
- `NodeSpec<TAll, TSelf>` — single node: id, desc, produces, consumes, deps, validate, mode, nodeType
- `ValidationRule` — discriminated union: artifact-exists, shell, build-produces, launch-check, spec-conformance, intent, expanded
- `EmitGalleryNodeSpec` — gallery node type: candidates, strategies, selectionMode
- `GalleryCandidate` — plan template output: parameters, dag, estimates, gateProfile
- `CandidateResult` — emit gallery output per strategy: files, deterministic, intent, summary
- `FileToIntents` — inverted index: file path → intent statements covering it
- `StrategySpec` — generation strategy: id, label, systemPrompt, model, estimatedCostMultiplier
- `IntentJudgment` — LLM judgment: statement, confidence, reasoning, evidence[]

**Quick check**: `grep -q "cmdPlanGallery\|plan.*gallery" bin/roadmap.ts`

## Scope Boundaries

**Allowed to modify** (produces):
- `bin/roadmap.ts`

**Read-only** (consumes + ambient):
- `src/lib/gallery.ts` (read-only)
- `src/lib/gallery-templates/index.ts` (read-only)
- `src/lib/cost-estimator.ts` (read-only)

**Forbidden**: any file not listed above. Single-domain rule: do not touch files outside the fr-predicates domain.

## Required Artifacts

- `bin/roadmap.ts`

## Verification

- [ ] `grep -q "cmdPlanGallery\|plan.*gallery" bin/roadmap.ts`
- [ ] `grep -q "buildGallery" bin/roadmap.ts`
- [ ] `grep -q "plan-selection" bin/roadmap.ts`
- [ ] `npx tsc --noEmit`

## Failure Handling

STOP if blocked. Output one blocking question. Do not guess, do not expand scope, do not modify adjacent code.

## Executor Instructions

Execute-only mode. Produce exactly the artifacts listed above. Do not:
- Refactor adjacent code
- Add features beyond what the artifacts require
- Expand scope beyond this node's domain
- Read files not listed in Context

Verify with: `grep -q "cmdPlanGallery\|plan.*gallery" bin/roadmap.ts`
