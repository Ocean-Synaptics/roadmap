# SKILL.md — DAG Expansion Protocol Guide

**roadmap/protocol**: type-safe governance specification for autonomous execution.

## Core API

```typescript
// Construct & validate
define(graph({ id, desc, init, term, nodes }))     // validate structure
verify(g)                  // validate contracts (consumes satisfied)
check(g)                   // validate connectivity (init→term reachable)
order(g)                   // topological sort (execution sequence)

// Position & reconcile
orient(g, exists)          // current node (first with missing artifacts)
reconcile(g, fwd, bwd)     // find where produces meets consumes

// DAG composition (v0.2+)
merge(g1, g2, connections) // combine at join points
branch(g, fromNode)        // extract variant (parallel development)
```

## Expansion Protocol (DAG Design)

**1. Define INIT and TERM**: what exists vs. what should exist

**2. EXPAND forward**: add nodes from INIT toward TERM

**3. EXPAND backward**: add nodes from TERM backward to fill gaps

**4. RECONCILE**: find where produces meets consumes (`reconcile(g, fwd, bwd)`)

**5. VALIDATE**: `define()` + `check()` + `verify()` pass

## Simple example

```typescript
const roadmap = define(graph({
  id: 'cli', init: 'scaffold', term: 'released',
  nodes: {
    scaffold:  { produces: ['src/main.ts'], deps: [] },
    features:  { produces: ['src/cli.ts'],  deps: ['scaffold'] },
    tests:     { produces: ['tests/'],      deps: ['features'] },
    released:  { produces: [],              deps: ['tests'] },
  }
}));

const pos = orient(roadmap, f => existsSync(f));
// pos.position tells which node has missing artifacts
```

## Recipes

### Session workflow
```typescript
import { orient, check, verify } from 'roadmap/protocol';
import roadmap from './roadmap.ts';

check(roadmap);    // structure valid
verify(roadmap);   // contracts satisfied

const pos = orient(roadmap, f => existsSync(f));
// Create pos.produces
// Re-run orient() to advance
```

### Multi-phase with merge
```typescript
const phase1 = define(graph({...}));
const phase2 = define(graph({...}));

const merged = merge(phase1, phase2, [
  { g1Node: 'term-1', g2Node: 'init-2', artifact: 'output.json' }
]);
```

### Parallel development with branch
```typescript
const main = define(graph({...}));
const variant = branch(main, 'midpoint');
// develop variant independently
const merged = merge(main, variant, [...]);
```

## Design principles

- **Type-safe**: Invalid refs are tsc errors
- **Acyclic**: define() prevents cycles
- **Connected**: check() validates reachability
- **Sound**: verify() ensures contracts satisfied
- **Incremental**: order() + orient() support stepwise execution

## Roadmap as governance

The DAG IS the governance mechanism:
- **Types** enforce structure (tsc checks)
- **Cycles** prevented (define validates)
- **Connectivity** verified (check)
- **Contracts** validated (verify)
- **Position** from filesystem (orient)
- **Gaps** identified (reconcile)

No configuration, no implicit state, no hidden dependencies.
