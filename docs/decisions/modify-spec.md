# Roadmap modification: delete/skip goals during execution

## Problem

Roadmaps are plans, not predictions. During execution, agents discover:
- A planned node is no longer needed (discovery obsoletes work)
- A better path exists (different approach is cheaper)
- A blocking dependency resolved differently (can skip intermediate node)

Current design: Roadmap is immutable. Agent can only refuse a node (stall).

Result: Cannot adapt. Must complete plan even if better option exists.

## Solution: `modify(g, nodeId, action)` function

Safe goal deletion with re-validation:

```typescript
const g = roadmap;
const modified = modify(g, 'git-state-spec', 'delete');
// Returns new graph OR throws if modification breaks contracts

const impact = analyze(g, 'git-state-spec');
// Returns: { dependents: [...], orphaned: [...], safe: boolean }

decision(g, 'git-state-spec', 'skip', 'Git cache not needed, orient() O(N) acceptable');
// Logs decision for audit trail
```

## Semantics

### modify(g, nodeId, action)

**Input**: Graph, target node, action
**Output**: Modified graph (if valid) or error

**Actions**:
- `delete` — remove node from DAG completely
- `skip` — mark as completed without work (don't execute)

**Validation after deletion**:
1. Remaining graph must be acyclic (call define())
2. All remaining nodes must be reachable from init (call check())
3. All consumes must be producible by predecessors (call verify())
4. Term must still be reachable

**If validation fails**: Throw with context
```
Error: Cannot delete 'git-state-spec':
  - Dependent nodes: ['git-state-impl']
  - git-state-impl.consumes includes 'src/git-state.schema.ts' from git-state-spec
  - Blocking: git-state-impl becomes unreachable
```

### analyze(g, nodeId)

**Purpose**: Before deciding to delete, show impact.

**Returns**:
```typescript
{
  dependents: string[];        // Nodes that depend on this
  orphaned: string[];          // Nodes left unreachable after deletion
  consumes: string[];          // Artifacts this node produces
  replaceable: boolean;        // Can another node produce consumes?
  safe: boolean;               // Can be deleted without breaking graph
  reason: string;              // Why it's safe/unsafe
}
```

**Example**:
```
analyze(g, 'git-state-spec'):
{
  dependents: ['git-state-impl'],
  orphaned: ['git-state-impl', 'git-state-orient'],
  consumes: ['docs/decisions/git-state-spec.md', 'src/git-state.schema.ts'],
  replaceable: false,
  safe: false,
  reason: 'Dependency chain: git-state-spec → git-state-impl → ... → phase-5-term'
}
```

But deleting `multi-repo-pattern` (which has no dependents):
```
analyze(g, 'multi-repo-pattern'):
{
  dependents: [],
  orphaned: [],
  consumes: [...],
  replaceable: true,
  safe: true,
  reason: 'Leaf node, safe to delete'
}
```

### decision(g, nodeId, action, reason, evidence?)

**Purpose**: Log why we're modifying the plan.

**Stores in**: `.boot/decisions.jsonl` (append-only log)

**Fields**:
```json
{
  "timestamp": 1708876800000,
  "action": "delete",
  "nodeId": "git-state-spec",
  "reason": "Orient O(N) acceptable for current scope",
  "evidence": "profiling shows 50ms per orientation, within SLA",
  "modifiedBy": "agent-123",
  "graph": { before: {nodes}, after: {nodes} },
  "validation": { define: true, check: true, verify: [] }
}
```

## Testing strategy (adv-modify.test.ts)

### Scenario 1: Safe deletion (leaf node)
```
- Delete 'multi-repo-pattern' (no dependents)
- modify() succeeds
- Graph remains valid (acyclic, contracts satisfied)
```

### Scenario 2: Unsafe deletion (blocks chain)
```
- Delete 'git-state-spec'
- modify() throws with reason: "blocks git-state-impl → phase-5-term"
- Original graph unchanged
```

### Scenario 3: Cascade analysis
```
- analyze('adv-reconcile')
- Returns: dependents=['adv-property', 'fix-reconcile']
- safe=false because removing it orphans both
```

### Scenario 4: Decision logging
```
- decision(g, 'X', 'delete', 'reason', 'evidence')
- Writes to .boot/decisions.jsonl
- Next audit shows decision context
```

### Scenario 5: Modify then continue
```
- Delete node A
- Re-orient from modified graph
- Position updates correctly
- Remaining chain still reaches term
```

## Integration with orient() + audit

After modification:
1. Call `decision()` to log
2. Call `modify()` to update graph
3. Call `orient(newGraph, exists)` to find next position
4. Agent continues with modified roadmap
5. Checkpoint stores modified graph version

## Design constraints

1. **Immutability by default**: Original graph untouched. modify() returns new graph.
2. **Fail-fast**: Invalid modifications throw immediately (don't return partial results).
3. **Audit trail mandatory**: Every modification must log decision.
4. **Re-validation required**: Every deletion triggers define() + check() + verify().

## Next: implementation

See modify-impl, adv-modify nodes in roadmap.ts.
