# Roadmap Expansion Skill
DAG expansion: INIT (current) ↔ TERM (desired). Bidirectional until paths meet, reconcile gaps.
## Imports
```typescript
import { define, verify, check, orient, reconcile, merge, branch, order, parallelOrder } from 'roadmap/protocol';
import { fileExists, siblingArtifactExists, gitArtifactAt, any } from 'roadmap/predicates';
```
## API
| fn | spec |
|----|------|
| `define(g)` | validate DAG |
| `verify(g)` | consumes satisfied? |
| `check(g)` | init→term, no orphans? |
| `orient(g, exists)` | `{ position, done, produces, consumes, remaining, complete }` |
| `reconcile(g, fwd, bwd)` | `{ connections, gaps }` |
| `merge(g1, g2, c)` | combine DAGs |
| `branch(g, n)` | subgraph n→term |
| `order(g)` | linear topo |
| `parallelOrder(g)` | concurrent batches |
## Types
```typescript
type NodeSpec<T, S extends T> = { id: S; desc: string; produces: string[]; consumes: string[]; deps: ReadonlyArray<T>; validate: { type: 'artifact-exists'; target: string }[]; idempotent: boolean; };
type Graph<T extends string> = { id: string; desc: string; version?: string; init: T; term: T; nodes: Record<T, NodeSpec<T, T>>; };
type Orientation = { position: string; done: string[]; produces: string[]; consumes: string[]; remaining: string[]; complete: boolean; };
type Gap = { between: [string, string]; missing: string[] };
```
## Example
```typescript
const g = define(graph({
  id: 'p', init: 'a', term: 'c', nodes: {
    a: { id: 'a', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
    b: { id: 'b', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
    c: { id: 'c', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: false },
  }
}));
verify(g); check(g);
orient(g, fileExists(process.cwd()));
```
## Predicates
`fileExists(root)` | `siblingArtifactExists(root, repo)` | `gitArtifactAt(root, ref)` | `any(...p)`
## Errors
`CYCLE_DETECTED` | `MISSING_INIT_OR_TERM` | `CONSUMES_NOT_SATISFIED` | `NODE_UNREACHABLE` | `NODE_ID_CONFLICT`
## Files
| file | purpose |
|------|---------|
| `src/protocol.ts` | core |
| `src/lib/*.ts` | versioning, checkpoint, audit |
| `tests/adv-*.test.ts` | correctness |
| `docs/MODULE-MAP.md` | reference |
