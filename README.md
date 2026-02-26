# Roadmap
DAG expansion protocol: typed governance over development. INIT ↔ TERM. The roadmap IS the governance.
## Quick Start
```bash
npm install roadmap
```
```typescript
import { define, graph, orient, fileExists } from 'roadmap/protocol';
const g = define(graph({
  id: 'ex', init: 'a', term: 'c', nodes: {
    a: { produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
    b: { produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
    c: { produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: false },
  }
}));
orient(g, fileExists(process.cwd()));
```
## API
| fn | purpose |
|----|---------|
| `define(g)` | validate DAG |
| `verify(g)` | consumes satisfied? |
| `check(g)` | reachable? |
| `orient(g, e)` | position |
| `reconcile(g, f, b)` | gaps |
| `merge/branch` | combine/subgraph |
| `order/parallelOrder` | sort |
## Examples
**Merge**: `merge(p1, p2, [{g1Node: 'a', g2Node: 'b', artifact: 'x'}])`
**Branch**: `branch(m, 'test')`
**Parallel**: `parallelOrder(g).map(b => Promise.all(b.map(execute)))`
## Predicates
```typescript
import { fileExists, siblingArtifactExists, gitArtifactAt, any } from 'roadmap/predicates';
any(fileExists(cwd), siblingArtifactExists(cwd, '../s'), gitArtifactAt(cwd, 'v1'));
```
## CLI
```bash
roadmap chart            # status
roadmap orient --note    # position
roadmap validate --note  # check DAG
roadmap trail [--last N] # history
```
## Entry Points
```typescript
import roadmap from 'roadmap';
import { define, verify, check, orient, reconcile, merge, branch, order, parallelOrder } from 'roadmap/protocol';
import { fileExists, siblingArtifactExists, gitArtifactAt } from 'roadmap/predicates';
```
## Design
**Bidirectional**: expand forward + backward until meet. **Reconcile**: gaps → bridging nodes → merge. **Validate**: define (import), verify+check (on-demand), orient (session). **Execute**: orient → produce → orient until position === term.
## Testing
```bash
npm test && npm run check
```
Tests: `adv-*.test.ts` for correctness.
## References
- **[SKILL.md](./SKILL.md)** — API
- **[docs/MODULE-MAP.md](./docs/MODULE-MAP.md)** — modules
- **[docs/decisions/](./docs/decisions/)** — rationales

MIT License
