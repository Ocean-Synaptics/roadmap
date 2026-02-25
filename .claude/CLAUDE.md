# roadmap

DAG expansion protocol library. Any repo can depend on this package, define a `roadmap.ts`, and get typed governance over its development plan.

## Entry Points

| Import | What |
|--------|------|
| `roadmap` | Full API — DAG ops + recovery + versioning + predicates + errors |
| `roadmap/protocol` | Core — define, verify, orient, merge, branch, reconcile, parallelOrder |
| `roadmap/agent` | Sealed agent API — getBrief, advance, checkpoint (no DAG introspection) |
| `roadmap/recovery` | CheckpointManager + AuditTrail |
| `roadmap/validation` | validateNode, validateGraph |
| `roadmap/versioning` | loadDAG, migration, compatibility |

Full file-by-file map: `docs/MODULE-MAP.md`

## Core API

```
define(g)                validate structure (cycles, init/term)
verify(g)                validate contracts (consumes satisfied by predecessors)
check(g)                 termination (every node reachable init→term)
order(g)                 implementation sequence (topo sort)
parallelOrder(g)         batched topo sort → string[][] (concurrent execution groups)
orient(g, exists)        agent reorientation (position from filesystem state)
reconcile(g, fwd, bwd)   find where forward.produces meets backward.consumes
merge(g1, g2, conn)      combine DAGs at join points
branch(g, from)          extract subgraph
fileExists(root)         curried predicate for orient()
RoadmapError(code, ctx)  typed error with fix suggestion
```

## Key Types

```typescript
NodeSpec<TAll, TSelf>   { id, desc, produces, consumes, deps, validate, idempotent }
Graph<T>                { id, desc, init, term, nodes: { [N in T]: NodeSpec<T, N> } }
Orientation             { position, done, produces, consumes, remaining }
RoadmapError            { code: ErrorCode, context: { fix, entry, ... } }
Brief                   { nodeId, desc, produces, consumes, handoffs }
FinalHandoff            { summary, keyDecisions, gotchas, timestamp }
```

## Quick Usage

```typescript
import { define, graph, orient, fileExists } from 'roadmap';

const g = define(graph({
  id: 'my-project', desc: '...', init: 'start', term: 'done',
  nodes: {
    start: { id: 'start', desc: '...', produces: ['src/index.ts'], consumes: [], deps: [], validate: [{ type: 'artifact-exists', target: 'src/index.ts' }], idempotent: true },
    done:  { id: 'done',  desc: '...', produces: [], consumes: ['src/index.ts'], deps: ['start'], validate: [], idempotent: false },
  },
}));

const pos = orient(g, fileExists(process.cwd()));
// pos.position, pos.produces, pos.consumes, pos.remaining
```

## File Headers

Every src/ file has structured headers for machine discovery:
```
// @module protocol
// @exports define, verify, orient, merge, branch, ...
// @types NodeSpec, Graph, Orientation, ...
// @entry roadmap/protocol
```

Grep for `@exports` across src/ to get the full API map without reading function bodies.

## Validation Stack

| Layer | What it catches | When |
|-------|----------------|------|
| `tsc --noEmit` | Invalid dep refs, missing nodes, id/key mismatch | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced by predecessor | On demand |
| `check(g)` | Disconnected nodes, unreachable from init or term | On demand |
| `orient(g, exists)` | Position from filesystem — which artifacts actually exist | Session start |

## This Repo's Own Roadmap

DAG stored in `.roadmap/head.json`. Query via `roadmap.ts`:

```
node --experimental-strip-types roadmap.ts --position   # JSON: position, produces, remaining
node --experimental-strip-types roadmap.ts --show        # Human-readable summary
node --experimental-strip-types roadmap.ts --validate    # Run all validation rules
```

## Expansion Protocol

1. Define INIT (what exists) and TERM (what should exist)
2. EXPAND backward from TERM
3. FLIP — EXPAND forward from INIT
4. RECONCILE — `reconcile(g, fwd, bwd)` finds where produces meets consumes
5. RECURSE into gaps
6. `define(g)` after every change, `check(g)` to test termination
7. Done when `check()` returns `{ done: true }` and `verify()` returns `[]`
