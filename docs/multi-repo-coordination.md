# Multi-Repo Coordination

Building across multiple repositories in a workspace using roadmap merge and cross-repo predicates.

## Pattern: Workspace Merge

Scenario: monorepo with independent packages (frontend, backend, shared). Each has its own roadmap.ts.

### Individual Roadmaps

**shared/roadmap.ts**
```typescript
const shared = graph({
  id: 'shared', init: 'compile', term: 'published',
  nodes: {
    compile: { produces: ['lib/index.js'], ... },
    published: { produces: [], consumes: ['lib/index.js'], ... },
  }
});
```

**frontend/roadmap.ts**
```typescript
const frontend = graph({
  id: 'frontend', init: 'setup', term: 'built',
  nodes: {
    setup: { produces: ['package.json'], ... },
    build: { produces: ['dist/app.js'], consumes: ['lib/index.js', 'package.json'], ... },
    built: { produces: [], consumes: ['dist/app.js'], ... },
  }
});
```

**backend/roadmap.ts** (similar pattern)

### Merge at Workspace Root

```typescript
// Load all roadmaps
const shared = loadDAG('shared/roadmap.ts');
const frontend = loadDAG('frontend/roadmap.ts');
const backend = loadDAG('backend/roadmap.ts');

// Connect shared → frontend
const step1 = merge(shared, frontend, [
  { g1Node: 'published', g2Node: 'setup', artifact: 'lib/index.js' }
]);

// Connect shared → backend
const combined = merge(step1, backend, [
  { g1Node: 'published', g2Node: 'setup', artifact: 'lib/index.js' }
]);

// Now: shared.compile → shared.published → {frontend,backend} in parallel
```

### Execution

```typescript
const pos = orient(combined, fileExists(process.cwd()));

// Find position across all three repos
console.log(`Position: ${pos.position}`);
console.log(`Done across workspace: ${pos.done.join(', ')}`);

// Execute from current position
// ...
```

## Pattern: Dependent Workspaces

Scenario: multi-repo workspace where repos depend on each other (repo A → repo B → repo C).

### Setup

```typescript
// repo-a/roadmap.ts
const a = graph({
  id: 'a', init: 'start', term: 'done',
  nodes: {
    start: { produces: ['dist/a.js'], ... },
    done: { produces: [], consumes: ['dist/a.js'], ... },
  }
});

// repo-b/roadmap.ts
// Consumes: siblingArtifactExists(root, '../repo-a') → 'dist/a.js'
const b = graph({
  id: 'b', init: 'start', term: 'done',
  nodes: {
    start: { produces: [], consumes: ['../repo-a/dist/a.js'], ... },
    build: { produces: ['dist/b.js'], consumes: ['../repo-a/dist/a.js'], ... },
    done: { produces: [], consumes: ['dist/b.js'], ... },
  }
});

// At workspace root: merge A → B
const combined = merge(a, b, [
  { g1Node: 'done', g2Node: 'start', artifact: 'dist/a.js' }
]);
```

## Pattern: Cross-Orientation

Find position across dependent repos:

```typescript
import { crossOrient } from 'roadmap/lib/cross-orient';

const pos = await crossOrient(combined, {
  root: process.cwd(),
  checkArtifact: fileExists,
  repos: {
    'repo-a': { path: './repo-a', roadmap: 'roadmap.ts' },
    'repo-b': { path: './repo-b', roadmap: 'roadmap.ts' },
  },
  blockedBy: ['repo-c'], // optional: wait for repo-c
});

// pos includes parallel artifact checks from all repos
```

## Best Practices

1. **Keep repos independent**: each roadmap.ts is valid on its own
2. **Use siblingArtifactExists** for cross-repo predicates, not file paths
3. **Merge at workspace root**, not inside repos
4. **Name join points clearly**: which node produces, which consumes
5. **Test locally first**: run `roadmap chart` in each repo, then test merged DAG
6. **Document dependencies**: add comments in roadmap.ts explaining connection logic

## Avoid

- Circular dependencies (A → B → A)
- Merging at multiple levels (confusing position tracking)
- Hard-coded paths (use predicates instead)
- Modifying merged DAG after creation (regenerate instead)

## See Also

- `docs/decisions/merge-design.md` — merge() semantics
- `src/lib/cross-orient.ts` — async cross-repo position finding
- `tests/fr-consumer-e2e.test.ts` — full monorepo example
