---
description: "FR-RM-HALLUCINATION-PROTOCOL-014 — Strategy protocol registry + hint-latch (hallucination + validate) with receipts"
dagId: fr-rm-hallucination-protocol-014
---

# Tasks: FR-RM-HALLUCINATION-PROTOCOL-014

**Input**: src/lib/metaflow/ (types, fs, miner, audit), bin/roadmap.ts, src/lib/render/, src/lib/import/, src/lib/completion-context.ts
**Goal**: Once a user hints at hallucination/parallelism strategy, roadmap (a) recognises the class, (b) proposes structured strategy candidates, (c) selects one with a receipt, (d) binds to the run, (e) never asks user to restate the approach. No env bypass. STRATEGY_REQUIRED error gates dispatch/complete when latch set and no selection receipt exists.

## Phase 0: Init

- [P0] rm-strategy-contract: Existing codebase — src/lib/strategy/ (if any), bin/roadmap.ts, src/lib/metaflow/audit/, .roadmap/strategy.json
  - produces: bin/roadmap.ts, src/lib/metaflow/audit/required-schema.ts

## Phase 1: Registry + Schema

- [P1] rm-strategy-registry: Implement strategy registry + schema generation; ship REGISTRY.json. **`src/lib/strategy/registry.ts`**: `StrategyConfig` type (`{ id: string, name: string, desc: string, rounds: number, gateMode: 'per-batch'|'per-phase'|'terminal', allowedBypasses: never[], estimatedRisk: 'low'|'medium'|'high' }`); registry array with canonical strategies: `HALLUCINATE_ROUNDS_THEN_VALIDATE` (rounds:2, gateMode:'terminal', risk:'medium'), `VALIDATE_AS_YOU_GO` (rounds:1, gateMode:'per-batch', risk:'low'), `HYBRID` (rounds:2, gateMode:'per-phase', risk:'medium'); `getStrategy(id)` → StrategyConfig|undefined; `listStrategies()` → StrategyConfig[]. **`src/lib/strategy/schema.ts`**: `StrategyConfig`, `StrategyReceipt` ({ schema_version:1, strategyId:string, runId:string, headSha:string, treeSha:string, selectionMethod:'auto'|'ask'|'manual', candidateSetHash:string, config:StrategyConfig, evidence:string[], selectedAt:string }), `ActiveStrategy` ({ schema_version:1, strategyId:string, runId:string, latchedAt:string, boundAt:string, receiptPath:string }). **`.roadmap/strategy/REGISTRY.json`**: generated from registry array — schema_version:1, generatedAt, strategies array. **`tests/strategy/registry.test.ts`**: 6 tests — listStrategies returns 3 entries; getStrategy('HALLUCINATE_ROUNDS_THEN_VALIDATE') returns correct config; getStrategy('unknown') returns undefined; all strategies have allowedBypasses=[]; REGISTRY.json parseable and matches listStrategies(); schema types compile.
  - depends: rm-strategy-contract
  - produces: src/lib/strategy/registry.ts, src/lib/strategy/schema.ts, .roadmap/strategy/REGISTRY.json, tests/strategy/registry.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/strategy/registry.test.ts

## Phase 2: Hint Latch

- [P2] rm-strategy-hint-latch: Implement hint detection + per-run latch persistence. **`src/lib/strategy/hints.ts`**: `HINT_TOKENS: string[]` = ['hallucinate','swarm','parallel','lookahead','fidelity','mass parallel','validate later']; `detectHint(text:string)` → `{latched:boolean, matchedTokens:string[]}`; `shouldLatch(note:string)` → boolean. **`src/lib/strategy/active.ts`**: `readActiveLatch(base?)` → `ActiveStrategy|null` from `.roadmap/strategy/active.json`; `writeLatch(runId:string, base?)` → writes `{schema_version:1, latched:true, runId, latchedAt, boundStrategyId:null}`; `clearLatch(base?)` → removes file (requires explicit call, no auto-clear); `isLatched(base?)` → boolean. `readActiveStrategy(base?)` → `ActiveStrategy|null`; `writeActiveStrategy(a:ActiveStrategy, base?)` → writes `.roadmap/strategy/active.json`. **`tests/strategy/hints.test.ts`**: 8 tests — detectHint('using our hallucination approach') → latched:true; detectHint('validate as you go') → latched:true; detectHint('normal work') → latched:false; shouldLatch matches on any token; writeLatch writes file; isLatched true after write; clearLatch removes file; isLatched false after clear.
  - depends: rm-strategy-registry
  - produces: src/lib/strategy/hints.ts, src/lib/strategy/active.ts, tests/strategy/hints.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/strategy/hints.test.ts

## Phase 3: CLI — Propose / Select / Auto / Status / Clear

- [P3] rm-strategy-propose-select-cli: Add CLI commands propose/select/auto/status/clear with receipts + renderers. **`src/lib/strategy/select.ts`**: `proposeCandidates(opts:{runId,headSha,treeSha,note?})` → `{candidates:StrategyConfig[], candidateSetHash:string}`; `selectStrategy(id, method, opts)` → writes StrategyReceipt to `.roadmap/receipts/strategy-select-<ts>.json` + writes ActiveStrategy to `.roadmap/strategy/active.json`, returns receipt; `autoSelect(opts)` → picks based on DAG parallelism heuristic (maxParallelism>2 → HALLUCINATE, else VALIDATE_AS_YOU_GO), writes receipt; `clearStrategy(base?)` → removes active.json, writes clear-receipt. **`src/lib/render/strategy.ts`**: `renderCandidates(candidates)` → rich human table: ID | Name | Rounds | Gate | Risk; `renderActive(a)` → single-line binding summary; `renderReceipt(r)` → structured receipt view. **Wire into `bin/roadmap.ts`**: `strategy propose`, `strategy select <id> --note`, `strategy auto --note`, `strategy status`, `strategy clear` commands — each emits JSON + RenderV1; orient output includes `strategyBinding` field when active. **Hint integration**: orient's `--note` parsing calls `shouldLatch(note)` → if latched and no active strategy, include `strategyRequired:true` and candidates in orient output. **`tests/cli/strategy.test.ts`**: 10 tests — `strategy propose` returns 3 candidates; `strategy select VALIDATE_AS_YOU_GO` writes receipt+active; `strategy auto` picks based on parallelism; `strategy status` shows binding; `strategy clear` removes active; orient --note "using hallucination approach" includes candidates; orient --note "normal work" does not include strategyRequired; receipt has candidateSetHash; active.json has schema_version:1; receipt path matches pattern.
  - depends: rm-strategy-hint-latch
  - produces: src/lib/strategy/select.ts, src/lib/render/strategy.ts, bin/roadmap.ts, tests/cli/strategy.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/strategy.test.ts

## Phase 4: Execution Gate

- [P4] rm-strategy-exec-gate: Gate dispatch/complete when latch=true and no active strategy. **`src/lib/strategy/exec-gate.ts`**: `checkStrategyGate(base?)` → if `isLatched(base)` AND `readActiveStrategy(base) === null` → `{blocked:true, code:'STRATEGY_REQUIRED', fix:['roadmap strategy propose','roadmap strategy select <id> --note <reason>','roadmap strategy auto --note <reason>']}` else `{blocked:false}`; no env bypass. **Wire into `bin/roadmap.ts`**: dispatch and complete commands call `checkStrategyGate()` at entry; if blocked → stderr error JSON + exit(4). **`tests/cli/strategy-gate.test.ts`**: 6 tests — dispatch blocked when latched+no strategy; complete blocked when latched+no strategy; dispatch allowed when strategy active; complete allowed when strategy active; blocked error code is STRATEGY_REQUIRED; fix array contains strategy commands.
  - depends: rm-strategy-propose-select-cli
  - produces: src/lib/strategy/exec-gate.ts, tests/cli/strategy-gate.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/strategy-gate.test.ts

## Phase 5: Audit Detectors

- [P5] rm-strategy-audit-detectors: Add strategy compliance detectors to audit tail (STRATEGY_REQUIRED class). **`src/lib/metaflow/audit/detectors/strategy.ts`**: `detectStrategyCompliance(opts:{base?,repoRoot?})` → `DetectorResult[]`: **STRAT-001** `detectLatchWithoutStrategy`: read `.roadmap/strategy/active.json` and `.roadmap/receipts/strategy-select-*.json`; if latch file exists (latched:true) and no strategy receipt → `{code:'STRAT-001',passed:false,evidence:['latch set, no receipt'],fix:['roadmap strategy select ...']}`. **STRAT-002** `detectStrategyHeadShaMatch`: if strategy receipt exists, check receipt.headSha === current `git rev-parse HEAD`; if mismatch → finding with both SHAs. **STRAT-003** `detectMissingStrategyReceipt`: if dispatch or complete receipt exists in `.roadmap/receipts/` but no strategy-select receipt with matching runId → finding. **Register** detectors in REQUIRED.json `requiredDetectors` array via registry update: add 'STRAT-001','STRAT-002','STRAT-003'. **`tests/audit/strategy-detectors.test.ts`**: 8 tests — STRAT-001 fires when latch+no receipt; STRAT-001 passes with receipt; STRAT-002 fires on SHA mismatch; STRAT-002 passes on SHA match; STRAT-003 fires on dispatch+no strategy receipt; STRAT-003 passes when receipt present; detectStrategyCompliance returns 3 results; all pass on clean fixture.
  - depends: rm-strategy-exec-gate
  - produces: src/lib/metaflow/audit/detectors/strategy.ts, tests/audit/strategy-detectors.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/strategy-detectors.test.ts

## Phase 6: Terminal Intent Gate

- [P6] intent-strategy-nonforgetting: Terminal intent — once hint-latched, roadmap proposes concrete strategy candidates, requires selection receipt, binds to run, and never asks user to restate the approach.
  - depends: rm-strategy-audit-detectors
  - mode: plan
  - produces:
  - validate:
    - shell:npx vitest run tests/cli/strategy.test.ts
    - shell:npx vitest run tests/cli/strategy-gate.test.ts
    - shell:npx vitest run tests/audit/strategy-detectors.test.ts
    - intent:Once a user hints at hallucination/parallelism strategy (via any hint token), roadmap proposes 3 structured strategy candidates, gates dispatch/complete with STRATEGY_REQUIRED until selection, writes a receipt, binds to the run, and all subsequent commands reuse the binding without questioning the user
    - intent-confidence:0.9
    - intent-evaluator:self
    - intent-expand-on-fail:true
