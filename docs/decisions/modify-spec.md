# Modify Specification

## Problem

Once a DAG is defined, users want to:
- Add a new node (insert into execution path)
- Remove a node (skip work, simplify DAG)
- Update a node (change produces/consumes/deps)
- Reorder nodes (replan based on constraints)

Current approach: modify `head.json` directly (error-prone), re-export full graph (tedious).

## Solution

Provide atomic modify operations: `addNode()`, `removeNode()`, `updateNode()`. Each:
1. Takes a valid graph + change
2. Validates the result (`define()`, `verify()`, `check()`)
3. Returns new valid graph or fails with fix suggestion

## Design

### addNode

```typescript
addNode<T extends string>(
  g: Graph<T>,
  node: NodeSpec<T, T>,
  deps?: T[],
): Graph<T | typeof node.id>
```

Constraints:
- Node ID must not exist
- All deps must exist in graph
- Node must not create cycle
- If node has consumes, all must be produced by predecessors

### removeNode

```typescript
removeNode<T extends string>(
  g: Graph<T>,
  nodeId: T,
): Graph<Exclude<T, typeof nodeId>>
```

Constraints:
- Node must not be init or term
- Removing node must not disconnect graph (init still reaches term)
- If node is consumed by successors, they must have alternative producers

### updateNode

```typescript
updateNode<T extends string>(
  g: Graph<T>,
  nodeId: T,
  updates: Partial<NodeSpec<T, T>>,
): Graph<T>
```

Constraints:
- Node ID must exist
- Cannot change `id` field (use remove + add instead)
- All validation rules apply to updated node

### Semantics

All operations validate post-modification:
```typescript
const g2 = addNode(g1, { id: 'new', produces: [...], consumes: [...], deps: [...] });
// Implicitly runs: define(g2), verify(g2), check(g2)
// Throws RoadmapError if any check fails
```

## Implementation Notes

1. **Immutability**: return new graph object, don't mutate input
2. **Validation**: always validate result before returning
3. **Error context**: error message includes fix suggestion (e.g., "missing dependency on node X")
4. **Idempotence**: calling modify twice with same input should give same result

## Non-Goals

- Auto-fix graph issues (suggest fix, don't auto-apply)
- Merge/branch during modify (separate operations)
- History tracking (upstream of roadmap trail)
- Conflict resolution (graph is single source of truth)

## Rationale

**Why separate operations?**
- Each has distinct constraints
- Easier to reason about + test
- Clear error messages per operation

**Why validate every time?**
- Prevents invalid graphs from being created
- Early detection of cascading failures
- Safe to call in sequence

**Why not auto-fix?**
- Fixes are context-dependent
- User may disagree with suggestion
- Explicit is safer than implicit
