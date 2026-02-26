# Branch Design: Extracting Subgraph Variants

## Purpose

The `branch()` function extracts a variant DAG starting from a specified node and continuing to the terminal node. This enables creating checkpoints, partial builds, or recovery paths from midpoint in a larger DAG.

## Problem Statement

In a long-running project, recovery from failure or partial rebuilds are common scenarios:

1. **Checkpoint recovery**: Project fails at node X; need to restart from X without re-running nodes A, B, C
2. **Partial builds**: "Build and test from step 5 onward" — isolate a subgraph for parallel work or investigation
3. **DAG variants**: Same structure but different starting points — used in adoption scenarios where organizations adopt mid-project

`branch()` must:
- Preserve internal structure (acyclic, reachable)
- Include all nodes reachable from `fromNode` to terminal
- Maintain contract validity (consumes satisfied)
- Create a valid, executable DAG

## Algorithm

```
branch(g, fromNode)
  1. Validate g exists, fromNode exists in g
  2. Forward pass — find all nodes reachable from fromNode:
     - Initialize: forward = {}, queue = [fromNode]
     - While queue not empty:
       - n = queue.pop()
       - If n in forward, skip (visited)
       - Add n to forward
       - Find all successors of n (nodes that depend on n)
       - For each successor s:
         - If s not in forward: queue.push(s)
  3. Extract nodes: branchedNodes = { node ∈ g.nodes : node.id ∈ forward }
  4. Create branched graph:
     - id: `${g.id}:${fromNode}`
     - desc: `Branch of ${g.desc} from ${fromNode}`
     - init: fromNode
     - term: g.term
     - nodes: branchedNodes
  5. Validate branched: define(branched) → errors → throw
  6. Verify contracts: verify(branched) → errors → throw
  7. Return validated branched graph
```

## Key Design Decisions

### Reachability-Based Extraction

Only nodes reachable from `fromNode` to `g.term` are included. This ensures:
- No orphaned predecessors outside the branch
- No unreachable predecessors (which would cause validation failure)
- Clean, executable subgraph

Unreachable nodes are silently dropped — they are not part of the branch's execution path.

### Successor Tracing (Not Predecessor Pruning)

The algorithm traces **forward** (successors) rather than backward (predecessors):
- Start at `fromNode`
- Follow all edges (nodes that depend on current)
- Include everything reachable to `g.term`

This preserves parallelism and ensures the branch terminates at `g.term`.

### Direct Dependency Preservation

Extracted nodes retain their original `deps` fields **as-is**. However:
- If a dep node is not in the branch, validation will fail
- For valid branches, all deps of included nodes must be in the forward set (guaranteed by forward reachability)

### Init/Term Redefinition

- **init**: Changed from `g.init` to `fromNode` (new starting point)
- **term**: Kept as `g.term` (same endpoint)

This reflects the business intent: "run from here to the end" not "run from here to a new end".

### Full Validation Required

Branched graph must pass both:
1. **Structure validation (`define()`)**: acyclic, init reaches term
2. **Contract validation (`verify()`)**: all consumes satisfied

Invalid branches (where nodes at the branch boundary have unmet consumes) throw an error with clear context.

## Contracts

**Input**:
- `g`: valid DAG (passed through `define()`)
- `fromNode`: node ID that exists in g, and is reachable from g.init

**Output**:
- Branched subgraph with same terminal, new init, all reachable nodes included
- Returns graph of same type: `Graph<T>`

**Errors**:
- Null g or fromNode → "Graph and fromNode required"
- fromNode not in g.nodes → "fromNode not in graph"
- Branched graph fails define() → structure errors (e.g., cycles, unreachable term)
- Branched graph fails verify() → contract violations

## Examples

### Example 1: Linear Recovery

```
Original DAG: init → A → B → C → D → term

branch(g, 'C'):
  init → A → B → C → D → term
              ↓
          branch init

Result:
  C → D → term (with C as new init)
```

### Example 2: Parallel Work

```
Original DAG:
  init → A ──┐
         B ──┼→ C → D → term
         F ──┘

branch(g, 'C'):
  C → D → term
  (A, B, F excluded; C now init)
```

### Example 3: Partial Build With Parallel Deps

```
Original DAG:
  init → compile ──┐
                   ├→ test → deploy → term
      setup ──────┘

branch(g, 'test'):
  test → deploy → term
  (compile and setup excluded; test becomes init)
```

**Important**: `test` node's `deps` field originally referenced both `compile` and `setup`. In the branch, those nodes are dropped. If `test` only consumes artifacts from compile/setup (not produces), the branch fails validation. If `test` is independent (no consumes), branch succeeds.

### Example 4: Branch With Consumes Boundary

```
Original:
  init → build (produces: dist.js) → package (consumes: dist.js) → term

branch(g, 'package'):
  package → term
```

This **fails validation** because `package` consumes `dist.js`, but `build` is not in the branch. The error message is clear: "consumes 'dist.js' not satisfied".

To fix, caller must ensure the branch includes all producers of consumed artifacts, or redefine the graph structure.

## Testing Strategy

**Core contract tests** (`adv-branch.test.ts`):
1. Branch includes all nodes reachable from fromNode
2. Branch excludes unreachable nodes
3. Branched graph passes `check()` — init reaches term
4. Branched graph passes `verify()` — consumes satisfied
5. Branched DAG orientation advances correctly
6. Terminal node at correct position

**Boundary tests**:
1. Branch from middle of linear chain
2. Branch from node in parallel structure (preserves parallelism downstream)
3. Branch with unsatisfied consumes at boundary fails
4. Branch from init (equivalently narrow as original DAG)
5. Branch from term (empty or invalid)
6. fromNode not in graph throws error

## Related Functions

- **merge()**: Combines two DAGs; branch() creates the input variants
- **define()**: Validates branched graph structure
- **verify()**: Validates branched graph contracts
- **orient()**: Finds execution position in branched graph

## Impact

- Enables checkpointing and recovery workflows
- Supports adoption scenarios where mid-project takeover requires re-execution from branching point
- Allows clean separation of concerns for large multi-phase projects
- Facilitates testing of individual phases in isolation
