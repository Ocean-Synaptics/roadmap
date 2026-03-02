# Directory Structure Guide

Post `dir-refactor-001` reorganization (2026-03-01).

## Metrics

| Metric | Value |
|--------|-------|
| Total directories (src/lib) | 51 |
| Total .ts files (src/lib) | 260 |
| Total lines | 27,709 |
| Domains created | 18 |
| Dirs passing ≤10 constraint | 47/51 (92%) |
| Files passing ≤400 constraint | 258/260 (99%) |

### Constraint Violations

**Directories over 10 files:**

| Directory | Count | Notes |
|-----------|-------|-------|
| src/lib (root) | 55 | Consolidation candidate — phase 2 |
| src/lib/metaflow | 23 | Organized into phases/, state/, execution/, audit/ subdirs |
| src/lib/intake | 11 | +1 over limit |
| src/lib/render | 11 | +1 over limit |

**Files over 400 lines:**

| File | Lines | Notes |
|------|-------|-------|
| src/lib/protocol/operations.ts | 1003 | Core DAG operations — split candidate |
| src/lib/protocol/validation.ts | 412 | +12 over limit |

## Directory Map

### Core Infrastructure

```
src/lib/protocol/          Core DAG types, validation, operations
  types.ts                 NodeSpec, Graph, Orientation, ValidationRule
  schema.ts                Schema definitions
  operations.ts            define, verify, check, orient, merge, branch, reconcile
  validation.ts            validateNode, validateGraph, validateBatch
  index.ts                 Barrel

src/lib/core/              Core execution
  orient-cached.ts         Orientation caching
  orient-schema.ts         Schema utilities
  index.ts                 Barrel

src/lib/utils/             Grouped utilities
  git/                     git.ts, git-index.ts, git-state.schema.ts
  cluster/                 cluster.ts, solver.ts, cost-model.ts
  federation/              federation.ts
  tokens/                  token-store.ts, token-index.ts
```

### Domain Layers

```
src/lib/audit/             Code and analysis auditing (7 files)
  trail.ts, ingest.ts, recommend.ts, index.ts

src/lib/claims/            Claim rendering and validation (4 files)
  claims.ts, index.ts

src/lib/evidence/          Work proof collection and schema (4 files)
  schema.ts, collect.ts, index.ts

src/lib/intent/            Intent expansion, evaluation, gates (5+3 files)
  intent-expansion.ts, intent-evaluator.ts, intent-gate-enrichment.ts
  expansion/               detection.ts, gaps.ts, proposals.ts

src/lib/metaloop/          Iteration orchestration (3 files)
  evidence-integration.ts, index.ts

src/lib/metaflow/          Execution phases and orchestration (23 files, 4 subdirs)
  phases/                  miner.ts, mine-run.ts, opt-dag.ts, flows.ts, flow-schema.ts
  state/                   active-run.ts, session-store.ts
  execution/               wrap.ts, self-insert.ts, receipt-writer.ts, render-receipt.ts, guards.ts
  audit/                   detectors/ (4 files)

src/lib/completion/        Work tracking and completion storage (5 files)
  completion-context.ts, completion-store.ts, completion-tracker.ts, index.ts

src/lib/exploration/       Visual element exploration and interaction (10 files)
  visibility.ts, text.ts, style.ts, size.ts
  click.ts, type.ts, drag.ts, wait.ts
  runtime.ts, index.ts

src/lib/render/            Output rendering and templates (11 files)
  render/*, templates/*, index.ts

src/lib/intake/            Import, parsing, spec handling (11 files)
  intake.ts, intake-cmd.ts, intake-receipt.ts, intake-cluster.ts
  speckit-import.ts, spec-{generator,ir,origin,verifier}.ts
  auto-intake.ts, index.ts

src/lib/config/            Configuration, kernel enforcement (6 files)
  kernel-config.ts, kernel-enforcement.ts, rate-card.ts
  system-prompt.ts, context-prompt.ts, index.ts

src/lib/recipes/           Instruction/proposal generators (6 subdirs)
  dispatch/                dispatch.ts, dispatch-receipt.ts
  merge/                   merge-gate.ts, merge-gate-cmd.ts
  patch/                   patch-stack.ts, patch-stack-cmd.ts
  plan/                    plan-gate.ts
  overlay/                 overlay.ts, overlay-cmd.ts
  spawn/                   spawn-plan.ts

src/lib/strategies/        Specialization and strategy (2 files)
src/lib/strategy/          Strategy overlays (5 files)
src/lib/sgk/               Specialization kit (10+15 files in subdirs)
  cli/, detectors/, receipts/
```

### Validation & Verification

```
src/lib/verify/            DAG algorithms and orchestration (3 files)
  graph-algorithms.ts, orchestrator.ts, index.ts
  invariants/              metaloop-evidence.ts

src/lib/validation/        DAG validation (0 root + subdirs)
  invariants/              metaloop-evidence.ts
```

### Other

```
src/lib/agent/             Sealed agent API (2 files)
src/lib/cli/               CLI commands (5 files)
src/lib/recovery/          Checkpoint and audit trail (2 files)
src/lib/receipt-first/     Receipt-first pattern (5 files)
src/lib/receipts/          Receipt storage (2 files)
src/lib/internal/          Internal utilities (3 files)
src/lib/perf/              Performance (1 file)
src/lib/gallery-templates/ Gallery templates (1 file)
src/lib/import/            Legacy import (1 file)
```

## Barrel Exports

All domains re-export via `index.ts`. Existing imports via `roadmap/lib` continue to work through the main barrel at `src/lib/index.ts`.

```typescript
// Old style (still works)
import { NodeSpec } from 'roadmap/lib';
// New style (explicit domain)
import { NodeSpec } from 'roadmap/lib/protocol';
```

## Adding New Files

1. Identify the semantic domain
2. Place in `src/lib/DOMAIN/`; tests in `tests/DOMAIN/`
3. Add to `src/lib/DOMAIN/index.ts` barrel
4. Keep files ≤400 lines — split if growing beyond
5. If new domain: add to `src/lib/index.ts`

## Remaining Work (Phase 2)

- 55 files in `src/lib/` root need consolidation into `src/lib/tools/` or `src/lib/utilities/`
- `protocol/operations.ts` (1003 lines) needs splitting
- `protocol/validation.ts` (412 lines) marginal — monitor
- `intake/` and `render/` at 11 files each — one split or consolidation needed each
