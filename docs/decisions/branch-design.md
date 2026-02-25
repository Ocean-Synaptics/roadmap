# branch() design — extracting DAG variants for parallel development

## Signature
```typescript
function branch<T extends string>(
  g: Graph<T>,
  fromNode: T,
): Graph<T>
```

## Semantics
`branch(g, fromNode)` extracts a subgraph starting at fromNode and continuing to g.term:

1. **Input validation**: g must pass define() + verify()
2. **Node selection**: Include fromNode and all nodes reachable to g.term
3. **Init rewriting**: Set new init = fromNode (was g.init)
4. **Term unchanged**: term = g.term (same endpoint)
5. **Contract preservation**: All consumes in subgraph must be satisfied by predecessors within subgraph or provided as inputs
6. **Validation**: define() + verify() on branched graph must succeed

## Use cases
- **Parallel development**: Main roadmap → feature branch (continue from a checkpoint)
- **Regression testing**: Branch from a known-good checkpoint, test in isolation
- **Variant exploration**: A/B test roadmap designs by branching from the same point, merge winners back

## Example
```typescript
const main = define(graph({
  init: 'start', term: 'deploy',
  nodes: {
    start: { id: 'start', ..., produces: ['base'], deps: [] },
    feat: { id: 'feat', ..., produces: ['feature'], consumes: ['base'], deps: ['start'] },
    test: { id: 'test', ..., consumes: ['feature'], deps: ['feat'] },
    deploy: { id: 'deploy', ..., consumes: ['feature'], deps: ['test'] },
  },
}));

const variant = branch(main, 'feat');
// variant.init = 'feat' (was 'start')
// variant.term = 'deploy'
// variant.nodes includes: feat, test, deploy (not start)
// variant must satisfy: feat.consumes = ['base'] — either provided by caller or error

// If 'base' is not provided externally, verify() will report:
// "feat" consumes "base" — no predecessor produces it
// Caller must either:
//   A. Provide 'base' as an external artifact
//   B. Include 'start' in the branch (start fromNode earlier)
```

## Invariants
1. **Acyclicity**: branched graph has no cycles (checked by define())
2. **Reachability**: init reaches term (checked by check())
3. **External consumes**: any unsatisfied consumes must be provided externally (check via verify())

## Contrast with merge()
- **merge()**: Combine two complete DAGs at join points (init→term in both)
- **branch()**: Extract a subgraph from a point within one DAG, create variant

## Next: merge + branch workflow
```typescript
const main = ...;
const variant = branch(main, 'midpoint');
// Develop variant independently
const merged = merge(main, variant, []);
// Merge back into main (if compatible)
```

This enables parallel development with eventual consolidation.

## Not in scope (v0.3)
- Rebasing (replay variant's changes on top of main's new commits)
- Cherry-picking (extract single nodes with contracts)
- Squashing (collapse linear chains)
