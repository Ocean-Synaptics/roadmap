# roadmap-expand

Bidirectional DAG expansion — plan from goal to current state with formal validation.

## Protocol

```
STATES:
  SEED      → two nodes: INIT (what exists), TERM (what should exist). gap: total.
  EXPAND    → propose nodes from one end. each declares {produces, consumes, deps}.
  FLIP      → propose from the opposite end. must narrow the gap.
  RECONCILE → for each forward node F and backward node B: does F.produces satisfy B.consumes?
  LEAF      → connection found, edge is concrete. node is implementable.
  RECURSE   → connection found, edge is coarse. becomes sub-expansion with inherited boundary.
  DONE      → every node forward-reachable from INIT and backward-traceable to TERM.

TRANSITIONS:
  SEED      → EXPAND
  EXPAND    → FLIP
  FLIP      → RECONCILE
  RECONCILE → LEAF        when: concrete connection
  RECONCILE → RECURSE     when: coarse connection
  RECONCILE → EXPAND      when: no connection (gap remains)
  RECURSE   → EXPAND      (finer scope, inherited boundary)
  LEAF      → DONE        when: all nodes are leaves
  LEAF      → EXPAND      when: unexpanded nodes remain

INVARIANTS:
  - EXPAND adds nodes + edges, never removes
  - RECONCILE adds edges between existing forward and backward nodes
  - RECURSE replaces one coarse node with a sub-DAG preserving boundary contract
  - DONE requires: for all N, reachable(INIT, N) AND reachable(N, TERM)
```

## Input

- A goal: what should exist when done (becomes TERM node)
- Current state: what exists now (becomes INIT node)
- Optional: existing roadmap.ts to validate or expand further

## Output

A `roadmap.ts` file — a typed `Graph<T>` where:
- Every node has produces/consumes contracts
- `tsc --noEmit` passes (deps reference valid nodes, no self-refs)
- `define()` passes (no cycles, consumes resolve to predecessor produces)
- `check()` returns `{ done: true }` (fully reconciled)

## Validator

`src/protocol.ts` — mechanical backend. Four functions:

```
define(g)               → Graph<T>             validates structure (throws on error)
check(g)                → { done, orphans }    termination: all nodes connected init→term
reconcile(g, fwd, bwd)  → { connections, gaps } where do frontiers meet
order(g)                → string[]             implementation sequence (topo sort)
```

## Instructions

1. Define INIT: `{ id: 'init', produces: [what exists], consumes: [], deps: [] }`
2. Define TERM: `{ id: 'term', produces: [], consumes: [what must exist], deps: [] }`
3. EXPAND backward from TERM — ask: what must exist immediately before terminal state?
4. FLIP — EXPAND forward from INIT — ask: what can we build first?
5. RECONCILE — run `reconcile(g, forwardIds, backwardIds)`:
   - Connections: forward.produces matches backward.consumes → proven link
   - Gaps: no artifact overlap → need more nodes between frontiers
6. For each gap: RECURSE — sub-expand the coarse node, inheriting boundary contracts
7. After each expansion: run `define(g)` then `check(g)`
8. When `check(g)` returns `done: true` → output the final roadmap.ts

## Node Contract

Every node declares:
- `produces`: artifacts this step creates (files, exports, infra resources)
- `consumes`: artifacts this step requires (must be produced by a DAG predecessor)
- `deps`: which nodes must complete before this one (compile-time validated)

## Composition

This skill is callable by any agent at any depth:
- **architect**: initial decomposition of user goal into full roadmap
- **page**: sub-expansion when a leaf node is too coarse to implement
- **seneschal**: validation — run `check(g)` to verify plan completeness
- **fool**: adversarial review — run `reconcile()` to find gaps in proposed plans
