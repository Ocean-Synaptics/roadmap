# merge() design — combining DAGs at reconcile() join points

## Signature
```typescript
function merge<T1 extends string, T2 extends string>(
  g1: Graph<T1>,
  g2: Graph<T2>,
  connections: Array<{ g1Node: T1; g2Node: T2; artifact: string }>,
  init?: string,
  term?: string,
): Graph<T1 | T2>
```

## Semantics
`merge(g1, g2, connections)` combines two DAGs at specified join points:

1. **Input validation**: g1 and g2 must both pass define() + verify()
2. **Node unification**: If g1.term ≠ g2.init, explicitly connect them via connections
3. **Structural merge**: Add edges from g1.term to g2.init (or specified connection points)
4. **Consumes/produces union**: Merged graph consumes = g1.consumes + unmet g2.consumes; produces = g1.produces + g2.produces
5. **Init/term**: Default to g1.init and g2.term; optionally override
6. **Validation**: define() + verify() on merged graph — must succeed

## Join point strategy
Use `reconcile(g1, [g1.term], [g2.init])` to find where g1's produces meet g2's consumes:
- If connections found: add them as structural dependencies
- If gaps exist: they become work items for a bridging node

Caller pre-qualifies node ID conflicts before merge (if both DAGs have 'init', caller renames one).

## Node ID conflicts
**Strategy**: No implicit renaming. Caller is responsible for pre-qualification.
- If g1 has nodes {init, work, term} and g2 has {init, stage, term}, caller must rename before merge
- Rationale: transparency — don't silently change node IDs. Errors surface early (tsc for type checks, define() for cycles)

## Example
```typescript
const phase1 = define(graph({ init: 'init', term: 'term', nodes: { ... } }));
const phase2 = define(graph({ init: 'start', term: 'done', nodes: { ... } }));

// Rename phase2.init to avoid conflict
const phase2_renamed = { ...phase2, nodes: {
  start: phase2.nodes.start,  // renamed from 'init'
  ...phase2.nodes
}};

const merged = merge(phase1, phase2_renamed,
  [{ g1Node: 'term', g2Node: 'start', artifact: 'output.json' }],
  'init',   // merged init
  'done'    // merged term
);

// merged.init = 'init'
// merged.term = 'done'
// merged.nodes includes all nodes from both graphs + edge term→start via 'output.json'
```

## Invariants preserved
1. **Acyclicity**: merged graph has no cycles (checked by define())
2. **Reachability**: init reaches term in merged graph (checked by check())
3. **Contracts**: all consumes satisfied by predecessors (checked by verify())
4. **Partition**: order() + orient() partition holds on merged graph (invariant in implementation)

## Next: recursive expansion
merge() enables RECURSE from the roadmap protocol: expand coarse nodes into sub-DAGs and merge.
Example: `work` node becomes a sub-roadmap with its own phases. merge(main, work_sub, connections) replaces `work` with the sub-DAG.

## Not in scope (phase 2)
- Automatic node renaming (caller does this)
- Semantic unification (caller defines connections)
- Branching, rebasing (future phases)
