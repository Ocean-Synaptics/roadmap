# Tests for plan gallery: types, Pareto filtering, risk formula, cost estimation, template generation.

File: tests/gallery.test.ts

Test suites:
  computeRisk():
    - Both rates 1.0 → risk 0.0
    - Both rates 0.0 → risk 1.0 (cold start: default to 0 → risk = 1.0)
    - Mixed: (0.8 * 0.9) → risk = 1 - 0.72 = 0.28

  paretoFilter():
    - All candidates distinct → all survive (no domination)
    - B dominates A (cheaper AND faster AND safer) → A removed
    - Partial domination (cheaper but riskier) → both survive
    - Cold start (all risk=1.0): conservative template (lowest cost estimate) survives
    - Result always has 1–4 candidates

  estimateCost():
    - Cold start (no historyDir): confidence="cold-start", uses fallback rates
    - Opus-all allocation: higher cost, lower or equal wallClockMinutes
    - Haiku allocation: lower cost

  buildGallery():
    - Returns 3-4 candidates (Pareto filtered)
    - Each has id, label, estimates, gateProfile
    - Contains "corrective" template when history failure classes present

Import from src/lib/gallery.ts and src/lib/cost-estimator.ts.

## Context

**Domain**: fr-predicates

**Files to read**:
- `src/lib/gallery.ts`
- `src/lib/cost-estimator.ts`
- `src/lib/gallery-templates/index.ts`

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

**Quick check**: `npx vitest run tests/gallery.test.ts --reporter=dot`

## Scope Boundaries

**Allowed to modify** (produces):
- `tests/gallery.test.ts`

**Read-only** (consumes + ambient):
- `src/lib/gallery.ts` (read-only)
- `src/lib/cost-estimator.ts` (read-only)
- `src/lib/gallery-templates/index.ts` (read-only)

**Forbidden**: any file not listed above. Single-domain rule: do not touch files outside the fr-predicates domain.

## Required Artifacts

- `tests/gallery.test.ts`

## Verification

- [ ] Artifact exists: `tests/gallery.test.ts`
- [ ] `npx vitest run tests/gallery.test.ts --reporter=dot`

## Failure Handling

STOP if blocked. Output one blocking question. Do not guess, do not expand scope, do not modify adjacent code.

## Executor Instructions

Execute-only mode. Produce exactly the artifacts listed above. Do not:
- Refactor adjacent code
- Add features beyond what the artifacts require
- Expand scope beyond this node's domain
- Read files not listed in Context

Verify with: `npx vitest run tests/gallery.test.ts --reporter=dot`
