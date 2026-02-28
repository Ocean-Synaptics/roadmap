# Example Task B: Parallel Execution

Demonstrates batch-level parallelism — how independent nodes execute concurrently and how the DAG coordinates without an orchestrator.

## Batch Model

`parallelOrder(g)` computes a topological sort grouped by level:

```
L0: [init]
L1: [setup-db, setup-auth]        ← parallel batch
L2: [api-routes, auth-middleware]  ← parallel batch
L3: [integration-test]
L4: [term]
```

Nodes within a batch share no data dependencies. They can execute simultaneously.

## Parallel Node Pair

```typescript
const dbSetup: NodeSpec<All, 'setup-db'> = {
  id: 'setup-db',
  desc: 'Initialize database schema',
  produces: ['migrations/001.sql', 'src/db.ts'],
  consumes: ['config/database.json'],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', target: 'migrations/001.sql' },
    { type: 'shell', command: 'npx tsc --noEmit src/db.ts', expected: '0' },
  ],
  idempotent: true,
};

const authSetup: NodeSpec<All, 'setup-auth'> = {
  id: 'setup-auth',
  desc: 'Configure authentication provider',
  produces: ['src/auth.ts', 'config/auth.json'],
  consumes: ['config/database.json'],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', target: 'src/auth.ts' },
    { type: 'artifact-exists', target: 'config/auth.json' },
  ],
  idempotent: true,
};
```

Both depend on `init`, neither depends on the other. `parallelOrder()` places them in the same batch.

## Orient in Parallel Context

```typescript
const pos = orient(g, fileExists(root));
// pos.position = ['setup-db', 'setup-auth']  ← batch
// pos.level = 1
// pos.batchComplete = false
// pos.batchRemaining = ['setup-auth']  ← if setup-db done
```

Position is always a **batch** (array), not a single node. An agent claims one node from the batch; other agents claim others.

## Swarm Dispatch

```bash
# Orchestrator
roadmap orient --assign --note "dispatch L1 batch"
# Output: setup-db → agent-1, setup-auth → agent-2

# Agent 1
roadmap claim setup-db --owner agent-1
# ... execute ... git commit ...
roadmap complete setup-db

# Agent 2
roadmap claim setup-auth --owner agent-2
# ... execute ... git commit ...
roadmap complete setup-auth
```

No coordination messages. No shared state. The DAG is the coordinator — `advanceBatch()` gates progression until every node in the batch passes validation.

## Convergence

Downstream node `api-routes` has `deps: ['setup-db', 'setup-auth']`. It cannot start until both complete. `orient()` won't include it in position until L1 is fully done.

```
advanceBatch(g, fileExists(root))
// Validates: setup-db ✅, setup-auth ✅
// Returns: { position: ['api-routes', 'auth-middleware'], level: 2 }
```

This is the integration point — see `examples/integration.md` for the convergence pattern.

## When Not to Parallelize

- Shared mutable state (same file in two `produces`) → serialize
- Coordination cost > execution cost → single agent
- Fewer than 3 independent nodes → overhead exceeds benefit

The default is single-agent sequential. Parallelism is an optimization, not the default mode.
