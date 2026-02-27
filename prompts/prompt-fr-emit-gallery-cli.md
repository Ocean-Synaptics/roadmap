# Add `roadmap emit --gallery` command and emit-gallery complete dispatch to bin/roadmap.ts.

Two changes to bin/roadmap.ts:

1. New command: emit --gallery [--candidates N] [--from <spec>] [--select <id>] [--blend <A+B>] [--evaluate <json>] [--json]
   Handler cmdEmitGallery():
   a. Parse flags
   b. Load DAG, find emit-gallery nodes (nodeType === "emit-gallery")
   c. Call runGallery({ nodeSpec, strategies: STRATEGIES, workDir: repoRoot+"/.roadmap/gallery/" })
   d. Render scorecard ASCII table (Candidate, Files, LOC, tsc, vitest, build, intent, cost)
   e. Show: "Deterministic survivors: ...", "Intent survivors: ..."
   f. If --blend <A+B>: call blendCandidates(), re-evaluate, show blend result
   g. If --evaluate <json>: parse Judgment, record to .roadmap/evaluations/emit-selection.jsonl,
      copy winning candidate files to main working tree, commit
   h. If --select <id>: same as --evaluate without confidence check

2. In cmdComplete handler, add dispatch on node.nodeType:
   After loading nodeSpec, check: if ((nodeSpec as any).nodeType === "emit-gallery") {
     await handleEmitGalleryComplete(nodeSpec, repoRoot)
     return  // skip standard validation
   }
   handleEmitGalleryComplete() = runGallery + auto-select best intent survivor + commit files.

Wire in main switch: case "emit": if (args.includes("--gallery")) ...

Import runGallery from src/lib/emit-gallery.ts
Import blendCandidates from src/lib/blend.ts
Import STRATEGIES from src/lib/strategies/index.ts

After adding both changes, run: npx tsc --noEmit to verify no type errors.

## Context

**Domain**: fr-predicates

**Files to read**:
- `src/lib/emit-gallery.ts`
- `src/lib/blend.ts`
- `src/lib/strategies/index.ts`
- `src/protocol.ts`

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

**Quick check**: `grep -q "cmdEmitGallery\|emit.*gallery" bin/roadmap.ts`

## Scope Boundaries

**Allowed to modify** (produces):
- `bin/roadmap.ts`

**Read-only** (consumes + ambient):
- `src/lib/emit-gallery.ts` (read-only)
- `src/lib/blend.ts` (read-only)
- `src/lib/strategies/index.ts` (read-only)
- `src/protocol.ts` (read-only)

**Forbidden**: any file not listed above. Single-domain rule: do not touch files outside the fr-predicates domain.

## Required Artifacts

- `bin/roadmap.ts`

## Verification

- [ ] `grep -q "cmdEmitGallery\|emit.*gallery" bin/roadmap.ts`
- [ ] `grep -q "runGallery" bin/roadmap.ts`
- [ ] `grep -q "emit-gallery.*nodeType\|nodeType.*emit-gallery" bin/roadmap.ts`
- [ ] `npx tsc --noEmit`

## Failure Handling

STOP if blocked. Output one blocking question. Do not guess, do not expand scope, do not modify adjacent code.

## Executor Instructions

Execute-only mode. Produce exactly the artifacts listed above. Do not:
- Refactor adjacent code
- Add features beyond what the artifacts require
- Expand scope beyond this node's domain
- Read files not listed in Context

Verify with: `grep -q "cmdEmitGallery\|emit.*gallery" bin/roadmap.ts`
