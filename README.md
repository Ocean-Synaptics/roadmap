# roadmap — DAG governance for development

A TypeScript library for specifying project phases as a directed acyclic graph (DAG), with automated position-finding and gap analysis.

## What

A roadmap is a DAG where:
- **Nodes** are phases (each has `produces`, `consumes`, `deps`)
- **Edges** are dependencies (if A → B, then B depends on A)
- **INIT** is the current state
- **TERM** is the verified intent

The library provides 6 core functions:
- `define(g)` — validate structure (cycles, init/term)
- `verify(g)` — validate contracts (consumes satisfied)
- `check(g)` — validate connectivity (init→term reachable)
- `order(g)` — topological sort (execution order)
- `orient(g, exists)` — find current position (first incomplete node)
- `reconcile(g, fwd, bwd)` — gap analysis (where produces meets consumes)

Plus DAG composition:
- `merge(g1, g2, connections)` — combine two DAGs
- `branch(g, from)` — extract variant for parallel work

## Why

**The problem**: A prompt drifts. Adding features shifts priorities. Phases get unclear. Testing coverage diverges from intent.

**The solution**: A DAG is a machine-readable specification of "what should exist" — enforced by TypeScript types, validated at runtime, and used to guide execution.

## How

### Install

```bash
npm install roadmap
```

### Define a roadmap

```typescript
import { define, graph } from 'roadmap/protocol';

const roadmap = define(graph({
  id: 'my-project',
  desc: 'Build a CLI tool',
  init: 'scaffold',           // what exists now
  term: 'deployed',           // what should exist
  nodes: {
    scaffold: {
      id: 'scaffold',
      desc: 'Project boilerplate',
      produces: ['src/main.ts', 'package.json'],
      consumes: [],
      deps: [],
    },
    features: {
      id: 'features',
      desc: 'CLI implementation',
      produces: ['src/cli.ts'],
      consumes: ['src/main.ts'],
      deps: ['scaffold'],
    },
    tests: {
      id: 'tests',
      desc: 'Unit tests',
      produces: ['tests/'],
      consumes: ['src/cli.ts'],
      deps: ['features'],
    },
    deployed: {
      id: 'deployed',
      desc: 'Published to npm',
      produces: [],
      consumes: ['tests/', 'src/'],
      deps: ['tests'],
    },
  },
}));
```

### Find current position

```typescript
import { orient } from 'roadmap/protocol';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const pos = orient(roadmap, (artifact) => 
  existsSync(join(process.cwd(), artifact))
);

console.log(`Current node: ${pos.position}`);
console.log(`Artifacts to create: ${pos.produces}`);
console.log(`Remaining nodes: ${pos.remaining}`);

// Output:
// Current node: features
// Artifacts to create: src/cli.ts
// Remaining nodes: tests,deployed
```

### Validate

```typescript
import { check, verify } from 'roadmap/protocol';

check(roadmap);   // { done: true, orphans: [] }
verify(roadmap);  // []  (no unsatisfied consumes)
```

### Gap analysis

```typescript
import { reconcile } from 'roadmap/protocol';

const { connections, gaps } = reconcile(
  roadmap,
  ['features'],   // forward lane (spec-first)
  ['tests']       // backward lane (fix-driven)
);

// connections: where features.produces meets tests.consumes
// gaps: what intermediate node is needed
```

## Examples

### Multi-phase with merge

```typescript
const phase1 = define(graph({
  id: 'phase1', init: 'start', term: 'feature-done',
  nodes: { /* ... */ }
}));

const phase2 = define(graph({
  id: 'phase2', init: 'validate', term: 'deployed',
  nodes: { /* ... */ }
}));

const full = merge(phase1, phase2, [
  { g1Node: 'feature-done', g2Node: 'validate', artifact: 'feature.json' }
]);

// full.init = 'start', full.term = 'deployed'
```

### Parallel development with branch

```typescript
const main = define(graph({ /* ... */ }));

// Create a variant for feature development
const featureBranch = branch(main, 'midpoint');
// featureBranch.init = 'midpoint' (was 'start')
// featureBranch.term unchanged

// Work on variant independently, then merge back
```

## Type safety

The library uses TypeScript mapped types to enforce:
- Node IDs match their keys (`nodes: { myNode: { id: 'myNode' } }`)
- Dependencies reference valid nodes only (`deps: ['someExistingNode']`)
- No forward references, no undefined nodes

```typescript
// This is a compile error:
define(graph({
  nodes: {
    a: { deps: ['unknown'] }  // 'unknown' not in graph — tsc error
  }
}));
```

## API Reference

See [SKILL.md](./SKILL.md) for detailed protocol specification and recipes.

## License

MIT

## Contributing

Issues and PRs welcome.
