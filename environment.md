## 1 Project Identity & Constraints

roadmap — DAG expansion protocol library. TypeScript. Node 20+ ESM. Published as a local library; consumers define a `roadmap.ts` and get typed governance over their development plan.

Tech stack: TypeScript (node16 moduleResolution, strict), vitest for tests, no framework. All imports use `.ts` extensions.

Hard constraints:
- No Anthropic API calls in `src/` or `bin/` (stubs are allowed with a comment)
- `npx tsc --noEmit` must exit 0 after every change
- All new `src/lib/*.ts` files must start with structured headers: `// @module`, `// @exports`, `// @types`, `// @entry`
- Do not change existing exported types without updating all callers

## 2 Execution Reality

Build: `npx tsc` (no separate build step for library use)
Tests: `npx vitest run` (full) or `npx vitest run <file> --reporter=dot` (single file)
CLI: `node --experimental-strip-types bin/roadmap.ts <cmd> --note "<reason>"`
Type check: `npx tsc --noEmit`
Node completion: `bin/roadmap complete <node-id> --note "<what you produced>"`

## 3 Architectural Invariants

- `src/protocol.ts` is the core. Additive changes only — existing types must not change shape.
- `bin/roadmap.ts` is the sole CLI entry. All commands are functions named `cmdXxx(note: string)`. Each is registered in the main `switch` on `cmd`. Imports go at top of file.
- `src/lib/*.ts` are library modules. They import from `../protocol.ts` and each other. No circular imports.
- Tests import from `src/` and `src/lib/`. No test imports from `bin/`.
- Pre-commit hook enforces: commit message must reference a node ID or use `roadmap:` prefix. Bypass: `SKIP_NODE_CHECK='reason' git commit`.

## 4 State Authority Map

| File | Authority |
|------|-----------|
| `.roadmap/head.json` | DAG state — do not hand-edit |
| `bin/roadmap.ts` | CLI — modified by CLI nodes only |
| `src/protocol.ts` | Core types — modified by protocol nodes only |
| `src/lib/gallery.ts` | Gallery core — produced by fr-gallery-core |
| `src/lib/gallery-templates/index.ts` | Templates — produced by fr-gallery-templates |
| `src/lib/cost-estimator.ts` | Cost estimation — produced by fr-cost-estimator |
| `src/lib/emit-gallery.ts` | Emit pipeline — produced by fr-emit-gallery-core |
| `src/lib/blend.ts` | Blend operation — produced by fr-blend |
| `src/lib/strategies/index.ts` | Strategy specs — produced by fr-strategies |

## 6a Domain Map

| Domain | Files | Notes |
|--------|-------|-------|
| cli | `bin/roadmap.ts` | Single file, all commands |
| protocol | `src/protocol.ts` | Core types and functions |
| gallery | `src/lib/gallery.ts`, `src/lib/gallery-templates/index.ts`, `src/lib/cost-estimator.ts` | Plan gallery |
| emit-gallery | `src/lib/emit-gallery.ts`, `src/lib/blend.ts`, `src/lib/strategies/index.ts` | Emit pipeline |
| intent | `src/lib/intent-evaluator.ts` | Judgment audit trail |
| compile-prompts | `src/lib/compile-prompts.ts` | Prompt generation |
| tests | `tests/*.test.ts` | One test file per lib module |

## 6b Core Entities

- `Graph<T>` — typed DAG with nodes, init, term
- `NodeSpec<TAll, TSelf>` — single node: id, desc, produces, consumes, deps, validate, mode, nodeType
- `ValidationRule` — discriminated union: artifact-exists, shell, build-produces, launch-check, spec-conformance, intent, expanded
- `EmitGalleryNodeSpec` — gallery node type: candidates, strategies, selectionMode
- `GalleryCandidate` — plan template output: parameters, dag, estimates, gateProfile
- `CandidateResult` — emit gallery output per strategy: files, deterministic, intent, summary
- `FileToIntents` — inverted index: file path → intent statements covering it
- `StrategySpec` — generation strategy: id, label, systemPrompt, model, estimatedCostMultiplier
- `IntentJudgment` — LLM judgment: statement, confidence, reasoning, evidence[]

## 7 Test Harness

Framework: vitest. Config: `vitest.config.ts` at root.

Run single file: `npx vitest run tests/<file>.test.ts --reporter=dot`
Run all: `npx vitest run --reporter=dot`

Test file conventions:
- One `describe` block per exported function
- Use `os.tmpdir()` + random suffix for isolated filesystem tests; clean up in `afterEach`
- Import from `../src/lib/<module>.ts` (relative, with .ts extension)
- No mocking of filesystem — use real tmp dirs

## 8 High-Entropy Zones

**`bin/roadmap.ts`** (~2500 lines) — the most fragile file. Adding a command requires:
1. Add import at top (after existing imports, grouped logically)
2. Add `async function cmdXxx(note: string)` implementation
3. Add `case 'xxx': return await cmdXxx(note!)` in main switch (around line 150-200)
4. Run `npx tsc --noEmit` immediately after — this file has strict type checking

**`src/protocol.ts`** — additive only. Changing any exported type signature breaks downstream consumers without a compile error in this file.

## 9 Semantic Bindings

- `produces` — artifacts a node creates; what `complete` validates
- `consumes` — artifacts a node reads; must be produced by a predecessor
- `ambient` — shared context available to all nodes, not a dep edge
- `validate[]` — acceptance tests; shell commands, artifact-exists checks, intent rules
- `intent` rule — LLM-evaluated behavioral constraint; non-blocking until `complete --evaluate '[...]'` called
- `complete --evaluate` — inline LLM judgment; same schema as plan-gallery and emit-gallery selection
- `batchRemaining` — nodes in current batch whose produces don't yet exist on disk

## commit

53bcbe0

## dateVerified

2026-02-27
