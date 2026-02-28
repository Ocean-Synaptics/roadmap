# Example Task A: Node Structure

Demonstrates the anatomy of a roadmap node — fields, validation, and execution semantics.

## Node Definition

```typescript
const taskA: NodeSpec<AllNodes, 'task-a'> = {
  id: 'task-a',
  desc: 'Compile TypeScript source to dist/',
  produces: ['dist/index.js', 'dist/index.d.ts'],
  consumes: ['src/index.ts', 'tsconfig.json'],
  deps: ['setup'],
  validate: [
    { type: 'artifact-exists', target: 'dist/index.js' },
    { type: 'artifact-exists', target: 'dist/index.d.ts' },
    { type: 'shell', command: 'node dist/index.js --version', expected: '0' },
  ],
  idempotent: true,
};
```

## Field Semantics

| Field | Role | Constraint |
|---|---|---|
| `id` | Unique key, must match object key | Type-enforced by `NodeSpec<T, N>` |
| `desc` | Human-readable purpose | Informational |
| `produces` | Artifacts this node creates | Validation target — `complete` checks these |
| `consumes` | Artifacts this node reads | Contract — `verify()` ensures predecessors produce them |
| `deps` | Predecessor node IDs | Structural — `define()` rejects cycles |
| `validate` | Acceptance rules | Gate — `complete` runs these, rejects on failure |
| `idempotent` | Safe to re-execute | Advisory — affects retry strategy |

## Execution Loop

```
orient()          → position includes 'task-a'
show('task-a')    → read produces, consumes, validate
                  → read consumes: src/index.ts, tsconfig.json
                  → implement: tsc → dist/
git commit        → "task-a: compile TypeScript source"
complete('task-a') → runs validate[], may reject
orient()          → task-a no longer in position
```

## Validation Stack

Validators execute in order. First failure rejects the node.

1. `artifact-exists` — file must exist on disk. Cheapest check.
2. `shell` — run command, check exit code. Catches runtime errors the filesystem can't.
3. `build-produces` — compile step succeeds AND output exists. Combines 1+2.
4. `launch-check` — start process, verify it runs. Integration-level.
5. `spec-conformance` — maps to acceptance scenario. Spec-level.

## Mode

Default mode is `execute`. Nodes can also declare `mode: 'plan'` for decomposition gates — see task-b for parallel execution patterns.

## Key Invariant

A node is complete when **all** validators pass. Not "most". Not "the important ones". All of them. `complete()` is atomic — it either advances the node or rejects with structured `ValidationResult`.
