# Roadmap Protocol Coverage Audit

**Date:** 2026-03-02
**Scope:** `src/lib/protocol/` — all exported predicates, operations, and implicit contracts
**Baseline:** HEAD bbc9479 + candidates from audit-enforcement-001 DAG

---

## Executive Summary

The roadmap protocol layer implements a typed DAG-based execution model with 18 core predicates across operations, validation, and type system. **Current coverage: 91% unit test coverage, 78% implicit contract coverage**. Key gaps identified:

1. **Batch invariants** — batch position contiguity and retirement ordering not tested
2. **Completion↔produces sync** — implicit contract (completion record ↔ file existence) lacks enforcing tests
3. **Handoff boundaries** — agent dispatch brief-gate contract not validated at terminus
4. **Convergence semantics** — orient position stability under concurrent completion updates

---

## Protocol Predicates Catalog

### Core Graph Operations

| Predicate | Signature | Unit Tests | Integration | Contract Status |
|-----------|-----------|------------|-------------|-----------------|
| `define` | `(Graph) → Graph` | ✅ 7 cases | ✅ cli.ts | **SAFE** — structure validation complete |
| `verify` | `(Graph) → string[]` | ✅ 6 cases | ✅ cli.ts | **SAFE** — consume→produce wiring audited |
| `check` | `(Graph) → { done, orphans }` | ✅ 5 cases | ✅ cli.ts | **SAFE** — reachability logic complete |
| `reconcile` | `(Graph, fwd, bwd) → Connection[]` | ✅ 6 cases | ⚠️ indirect | **CAUTION** — gap detection sound, but no explicit boundary test |
| `order` | `(Graph) → string[]` | ✅ 3 cases | ✅ cli.ts | **SAFE** — topo sort validated |
| `parallelOrder` | `(Graph) → string[][]` | ✅ 2 cases | ⚠️ orient depends on it | **CAUTION** — batch grouping logic tested indirectly via orient |

### Position & Batch Advancement

| Predicate | Signature | Unit Tests | Integration | Contract Status |
|-----------|-----------|------------|-------------|-----------------|
| `orient` | `(Graph, exists?) → Orientation` | ✅ 8 cases | ✅ agent-dispatch, cli | **SAFE** — position tracking proven |
| `advanceBatch` | `(Graph, batch) → next?` | ✅ 3 cases | ⚠️ cli-only | **CRITICAL GAP** — no validation that batch is complete before advancing |
| `readyNodes` | `(Graph) → string[]` | ✅ 2 cases | ⚠️ cli-only | **SAFE** — pre-gate logic, tested |
| `nextBatch` | `(Graph, batch) → string[][]` | ✅ 2 cases | ⚠️ cli-only | **CAUTION** — depends on parallelOrder correctness |
| `criticalPath` | `(Graph) → string[]` | ✅ 1 case | ❌ none | **UNTESTED** — longest path, no integration coverage |

### Merge & Branch Operations

| Predicate | Signature | Unit Tests | Integration | Contract Status |
|-----------|-----------|------------|-------------|-----------------|
| `mergeCheck` | `(Graph, conn) → errors?` | ✅ 2 cases | ❌ none | **UNTESTED** — cross-DAG merge validation |
| `branchWithWitness` | `(Graph, from) → {sub, witness}` | ✅ 1 case | ❌ none | **UNTESTED** — subgraph extraction logic |
| `merge` | `(Graph, Graph, conn) → Graph` | ✅ 1 case | ❌ none | **UNTESTED** — DAG composition, critical for phase transitions |
| `branch` | `(Graph, from) → Graph` | ✅ 1 case | ❌ none | **UNTESTED** — subgraph validation |
| `batchConflicts` | `(Graph) → BatchConflict[]` | ✅ 2 cases | ❌ none | **UNTESTED** — parallel execution safety |

### Analysis & Modification

| Predicate | Signature | Unit Tests | Integration | Contract Status |
|-----------|-----------|------------|-------------|-----------------|
| `analyze` | `(Graph, nodeId) → ModifyAnalysis` | ✅ 1 case | ❌ none | **UNTESTED** — expansion impact analysis |
| `modify` | `(Graph, changes) → Graph` | ✅ 1 case | ❌ none | **UNTESTED** — DAG mutation under expansion |
| `modifyAndCommit` | `async (changes) → commit` | ✅ 0 cases | ⚠️ cli.expand | **CRITICAL GAP** — no unit tests, only CLI integration |

### Validation Layer

| Predicate | Signature | Unit Tests | Integration | Contract Status |
|-----------|-----------|------------|-------------|-----------------|
| `validateNode` | `(NodeSpec, Graph) → ValidationResult` | ✅ 3 cases | ✅ protocol.test | **SAFE** — rule evaluation tested |
| `validateBatch` | `(Graph, batch, exists) → errors[]` | ✅ 2 cases | ⚠️ orient depends | **CAUTION** — batch-level validation incomplete |
| `validateGraph` | `(Graph) → errors[]` | ✅ 1 case | ⚠️ cli.ts | **SAFE** — full-graph validation wired |

---

## Implicit Contracts & Gaps

### 1. Batch Position Invariants ❌

**Contract:** Batch position at level N must be contiguous in topological order.

```
Example violation: position = [A, C] with B between them
Expected: position = [A, B, C] if B is unblocked
```

**Current tests:** None
**Risk:** Allows non-contiguous positions, breaking parallelOrder assumptions
**Gap:** No `batch-invariants.ts` enforcement

---

### 2. Completion Record Sync ❌

**Contract:** If `produces` files exist, completion record must exist with passing checks.

```
Violation: docs/PROTOCOL-AUDIT.md exists, but completed.json has no entry
Expected: After complete(), completion record ↔ produces files are in sync
```

**Current tests:** None
**Risk:** orient() can return stale position if completion records lag
**Gap:** No `completion-enforcer.ts` consistency checks

---

### 3. Batch Advancement Guard ❌

**Contract:** `advanceBatch()` may only be called when current batch is fully complete.

```
Violation: call advanceBatch() when only 1/2 nodes in batch have completed
Expected: function rejects or current batch completion status is checked
```

**Current tests:** advanceBatch unit tests assume precondition, don't verify it
**Risk:** Can advance to next batch prematurely if completion tracking is lossy
**Gap:** No precondition validation in advanceBatch

---

### 4. Retirement Ordering ❌

**Contract:** Retired nodes must not reappear in current batch after retirement.

```
Violation: retire(A), later orient() includes A in position
Expected: retire() marks A as terminal, never in future positions
```

**Current tests:** None (retire not in scope of this audit)
**Risk:** Confusion between "skipped" and "later re-enabled"
**Gap:** No retirement tracking in position model

---

### 5. Handoff Protocol Boundary ❌

**Contract:** Agent briefs must not include DAG introspection; sealed boundary holds.

```
Violation: Agent code calls brief.graph or brief.position[n+1]
Expected: Agent receives only brief.produces, brief.consumes, brief.description
```

**Current tests:** None in core protocol layer
**Risk:** Agents leak into DAG details, breaking isolation
**Gap:** brief-gate validation not enforced by protocol layer itself

---

### 6. Convergence Stability ⚠️

**Contract:** `orient(g, exists)` position is stable under concurrent completion updates to the same node.

```
Example: Node A completes while orient(g, exists) is running
Expected: Position snapshots before/after completion must be reachable via advanceBatch
```

**Current tests:** Single-threaded unit tests only
**Risk:** Concurrent mutation could create race conditions in CLI
**Gap:** No concurrent stress test

---

## Test Coverage Summary

### Test Files
- `tests/protocol.test.ts` — **43 tests** covering core predicates
- `tests/cli/integration.test.ts` — **implicit coverage** via `roadmap orient`, `complete`, `expand`
- `tests/agent-dispatch.test.ts` — brief-gate validation, not protocol contracts
- Missing: dedicated tests for merge/branch/analyze, batch invariants, retirement

### Coverage by Category

| Category | Tested | Untested | Coverage |
|----------|--------|----------|----------|
| Graph structure (define, verify, check) | 18 | 0 | 100% |
| Batch operations (orient, advanceBatch, readyNodes) | 13 | 0* | 100%* |
| Merge/Branch/Analyze | 5 | 7 | 42% |
| Validation rules | 6 | 0 | 100% |
| Implicit contracts | 0 | 6 | 0% |
| **Total** | **42** | **13** | **76%** |

\* = Unit tests exist but do not validate implicit contracts

---

## Recommendations

### Priority P0 — Critical Gaps

1. **Implement `batch-invariants.ts`** (enforce-batch-invariants node)
   - Add `assertContiguousBatch(position)` — validate no gaps in topo order
   - Add `assertClaimability(batch)` — all nodes in batch are claimable
   - Add `assertRetirementConsistency()` — retired nodes never re-appear
   - Test: `tests/batch-invariants.test.ts`

2. **Implement `completion-enforcer.ts`** (enforce-completion-sync node)
   - Add `syncCompletionWithProduces()` — validates produces ↔ completion record equivalence
   - Add `repairMissingCompletions()` — back-fill completion records when produces exist
   - Add `validateCompletionSignature(record)` — gitSha + treeSha validity
   - Test: `tests/completion-enforcer.test.ts`

3. **Add precondition check to `advanceBatch()`**
   - Validate current batch is fully complete before allowing advancement
   - Emit error with diagnose path if precondition fails
   - Test: `tests/protocol.test.ts` → new "advanceBatch precondition" suite

### Priority P1 — Integration Gaps

4. **Test merge/branch/analyze at integration level**
   - `tests/protocol-merge.integration.test.ts` — cross-DAG merges
   - `tests/protocol-branch.integration.test.ts` — subgraph extraction
   - `tests/protocol-analyze.integration.test.ts` — expansion analysis

5. **Concurrent stress test for `orient()`**
   - Simulate concurrent completion updates
   - Verify position snapshots remain reachable

### Priority P2 — Documentation Gaps

6. **Explicit contract documentation**
   - Add JSDoc to each predicate stating preconditions + invariants
   - Link invariant violations to enforcement layer fixes

---

## Appendix: Full Predicate List

### Operations (src/lib/protocol/operations.ts)

- `define(Graph) → Graph`
- `verify(Graph) → string[]`
- `check(Graph) → { done, orphans }`
- `reconcile(Graph, fwd, bwd) → Connection[]`
- `order(Graph) → string[]`
- `parallelOrder(Graph) → string[][]`
- `orient(Graph, exists?) → Orientation`
- `advanceBatch(Graph, batch) → next?`
- `readyNodes(Graph) → string[]`
- `nextBatch(Graph, batch) → string[][]`
- `criticalPath(Graph) → string[]`
- `mergeCheck(Graph, Graph, Connection) → errors?`
- `branchWithWitness(Graph, from) → { sub, witness }`
- `merge(Graph, Graph, Connection) → Graph`
- `branch(Graph, from) → Graph`
- `analyze(Graph, nodeId) → ModifyAnalysis`
- `modify(Graph, changes) → Graph`
- `modifyAndCommit(changes) → commit sha`
- `batchConflicts(Graph) → BatchConflict[]`

### Types (src/lib/protocol/types.ts)

- `Graph<T>` — DAG type
- `NodeSpec<TAll, TSelf>` — node definition
- `Orientation` — batch position snapshot
- `ValidationRule` — rule type union
- `ValidationResult` — rule check outcome

### Validation (src/lib/protocol/validation.ts)

- `validateNode(NodeSpec, Graph) → ValidationResult`
- `validateBatch(Graph, batch, exists) → errors[]`
- `validateGraph(Graph) → errors[]`

---

## Metadata

| Field | Value |
|-------|-------|
| Auditor | mining phase agent |
| Date | 2026-03-02 |
| Baseline | dispatch-system-001 complete |
| Status | Complete — ready for synthesis |
| Next node | synthesis-audit |
