# Test Organization Guide

Adversarial test suites in this project validate protocol correctness through property-based and spec-driven assertions. This guide explains the structure and reading order.

## Progressive Disclosure Pattern

Tests are organized by implementation phase, each building on the previous. Read in order:

### Phase 1: Core Protocol (L00-L05)

**`adv-orient.test.ts`** — Orientation fundamentals
- Spec: empty-produces nodes should stall, not advance
- Tests: position finding, produces/consumes accumulation, completion detection
- Critical: validates the core execution model

**`adv-reconcile.test.ts`** — Gap identification
- Spec: gap.missing captures unmet demand only (not surplus)
- Tests: reconcile() correctness, gap semantics, connection discovery
- Critical: validates reconciliation without over-specification

**`adv-property.test.ts`** — Invariants across all graphs
- Property: for all valid graphs, order()→orient() consistent
- Property: check()→verify() agreement (reachability ↔ contracts)
- Tests: random DAG generation, property checking

### Phase 2: Merge (L06-L08)

**`adv-merge.test.ts`** — DAG combination
- Spec: merged DAGs preserve structure, contracts, and init→term reachability
- Tests: phase composition, connection handling, node isolation
- Pattern: g1.term → g2.init join points

### Phase 3: Branch (L09-L11)

**`adv-branch.test.ts`** — Subgraph extraction
- Spec: branches include all nodes reachable from extraction point to term
- Tests: recovery scenarios, partial builds, isolation
- Pattern: skip early work, restart from failure

### Phase 4+: Features

**`tests/adv-types.test.ts`** — Type system invariants
**`tests/adv-modify.test.ts`** — Mutation operations (future)
**`tests/adv-atomic-modify.test.ts`** — Atomic modifications (future)

## Reading Strategy

1. **Start at L00-L05** if learning protocol fundamentals
2. **Focus on spec comments** in each test — they explain design intent
3. **Property tests** show what should hold for ANY valid graph
4. **Example graphs** in fixtures demonstrate patterns (see `example/`)
5. **Check assertions** — they encode acceptance criteria

## Test Anatomy

```typescript
// Spec comment — the rule being tested
// Example: "empty-produces nodes do not advance"
describe('orient', () => {
  it('stalls on empty-produces', () => {
    // Setup: graph with empty-produces node
    const g = graph({ nodes: { n1: { produces: [], ... } } });

    // Action: orient after producing n1's artifacts (none)
    const pos = orient(g, () => true);

    // Assertion: position hasn't advanced
    expect(pos.position).toBe('n1');
  });
});
```

## Pattern Matching

Look for these patterns across tests:

- **Bidirectional tests**: forward expansion ↔ backward expansion
- **Reconciliation**: produces meeting consumes at exact boundaries
- **Idempotence**: idempotent=true nodes can re-run safely
- **Completeness**: check() + verify() together validate full DAG
- **Reachability**: init must reach term with no orphans

## Reference by Task

| Goal | See |
|------|-----|
| Understand orientation | `adv-orient.test.ts` + `fix-orient.test.ts` |
| Understand reconciliation | `adv-reconcile.test.ts` |
| Debug merge issues | `adv-merge.test.ts` |
| Debug branch issues | `adv-branch.test.ts` |
| Learn DAG patterns | `example/` + consumer tests |
| Type safety | `adv-types.test.ts` |

## Key Files

- `src/protocol.ts` — implementation being tested
- `tests/adv-*.test.ts` — specification tests
- `tests/fix-*.test.ts` — bug-fix validation
- `tests/fr-*.test.ts` — feature tests
- `tests/consumer-*.test.ts` — real-world usage
