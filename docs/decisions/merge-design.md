# Merge Design: Combining DAGs at Join Points

## Purpose

The `merge()` function combines two separate DAGs (g1 and g2) into a single unified DAG by establishing dependency edges from g1 nodes to g2 nodes at reconcile() join points. This enables sequential execution of multi-phase projects where later phases depend on artifacts produced by earlier phases.

## Problem Statement

After `reconcile(g, forward, backward)` identifies connection points between forward and backward node sequences, the project must unify those sequences into a single executable DAG. The challenge:

1. **Node ID isolation**: g1 and g2 are independent DAGs with potentially overlapping node IDs → must validate no conflicts
2. **Dependency construction**: Connections specify which g1 nodes satisfy which g2 node consumes → must add edges correctly
3. **Init/term boundaries**: g1 starts at g1.init, g2 ends at g2.term → merged DAG's init and term must reflect this
4. **Validation inheritance**: Merged graph must pass `define()` (acyclic, init↔term connected) and `verify()` (consumes satisfied)

## Algorithm

```
merge(g1, g2, connections, initOverride?, termOverride?)
  1. Validate g1, g2 exist
  2. Check node IDs: no conflicts between g1.nodes and g2.nodes
  3. Merge node maps: { ...g1.nodes, ...g2.nodes }
  4. For each connection { g1Node, g2Node, artifact }:
     - Find g2Node in merged nodes
     - Add g1Node to g2Node.deps (if not already present)
  5. Create merged graph:
     - id: `${g1.id}+${g2.id}`
     - init: initOverride || g1.init
     - term: termOverride || g2.term
     - nodes: mergedNodes
  6. Validate merged: define(merged) → errors → throw
  7. Verify consumes: verify(merged) → errors → throw
  8. Return validated merged graph
```

## Key Design Decisions

### Node ID Conflicts Are Fatal

Pre-qualification is the caller's responsibility. If g1 contains node 'build' and g2 also contains 'build', the merge fails with `NodeIDConflicts`. This ensures:
- No silent node overwriting
- Clear error messaging for caller to resolve
- Caller explicitly renames nodes before merge if needed

### Connection Edges Are Additive

`merge()` adds g1Node as a dependency to g2Node, but does not remove any existing dependencies. This preserves g2's internal structure:
- If g2Node already depends on [X, Y], and we add g1Node, it becomes [X, Y, g1Node]
- Prevents accidental removal of internal parallelism
- Multiple connections to the same g2Node are idempotent

### Init/Term Inference vs Override

Default behavior:
- `init = g1.init` (work starts at g1's entry)
- `term = g2.term` (work ends at g2's exit)

Optional overrides allow:
- Custom starting point if g1 has multiple entry candidates
- Custom terminal if g2 has multiple exit candidates
- Defaults cover 95% of use cases

### Full Validation Required

Merged graph must pass both:
1. **Structure validation (`define()`)**: acyclic, init reaches term, no missing nodes
2. **Contract validation (`verify()`)**: every consumed artifact has a producer

This prevents creating invalid DAGs that would fail at execution time. Early validation catches bugs in connection specification.

## Contracts

**Input**:
- `g1`, `g2`: valid DAGs (passed through `define()`)
- `connections`: array of `{ g1Node, g2Node, artifact }` where each entry corresponds to a reconcile() gap-close
- `initOverride`, `termOverride`: optional string node IDs

**Output**:
- Merged graph with acyclic structure, init↔term reachability, all consumes satisfied
- Returns graph of type `Graph<T1 | T2>`

**Errors**:
- Null g1 or g2 → "Both g1 and g2 required"
- Node ID conflicts → "NodeIDConflicts: [list]"
- g2Node not found in merged → "Connection g2Node not found"
- Merge fails define() → structure errors
- Merge fails verify() → contract violations

## Examples

### Example 1: Two-Phase Pipeline

```
g1: scaffold → build → package
g2: test → deploy

connections: [{ g1Node: 'package', g2Node: 'test', artifact: 'dist/app.js' }]

Result: scaffold → build → package → test → deploy
```

All of g2's internal structure is preserved. If g2 had parallel tasks, they remain parallel.

### Example 2: Multi-Phase with Shared Node

```
g1: init → gen-code
g2: init → compile → done

Node ID conflict: both have 'init'. Caller must pre-rename:
  g1.init → 'phase-1-init'
  g2.init → 'phase-2-init'

Then merge succeeds.
```

### Example 3: Multiple Connections

```
g1: step-a, step-b (both produce artifacts)
g2: step-c, step-d (both consume from step-a and step-b)

connections: [
  { g1Node: 'step-a', g2Node: 'step-c', artifact: 'a.txt' },
  { g1Node: 'step-b', g2Node: 'step-d', artifact: 'b.txt' }
]

Result: step-c depends on both step-a and step-c's original deps
        step-d depends on both step-b and step-d's original deps
```

Parallelism within g2 is preserved; step-c and step-d can run in parallel once their respective dependencies (both original and new) are satisfied.

## Testing Strategy

**Core contract tests** (`adv-merge.test.ts`):
1. Merge two linear chains via terminal→initial connection
2. Merged graph passes `check()` — init reaches term
3. Merged graph passes `verify()` — consumes satisfied
4. Merged graph `order()` includes all nodes
5. Multiple connections supported
6. Merged DAG orientation advances correctly
7. Terminal node at correct position

**Boundary tests**:
1. Empty produces nodes in g2 (gates)
2. Node ID conflicts detected and rejected
3. Missing g2Node in connection throws error
4. Init/term overrides work correctly

## Related Functions

- **reconcile()**: Identifies where g1.produces meets g2.consumes → connection specs
- **define()**: Validates merged graph structure (acyclic, reachable)
- **verify()**: Validates merged graph contracts (consumes satisfied)
- **orient()**: Finds execution position in merged graph from filesystem state

## Impact

- Enables multi-phase projects to be represented and executed as single unified DAGs
- Allows parallel graph expansion (reconcile two phases, merge, reconcile next phase)
- Supports adoption scenarios where projects grow from single-phase to multi-phase work
