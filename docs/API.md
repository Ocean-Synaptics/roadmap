# API Reference

## Main entry point

```typescript
import {
  // Core protocol
  define, graph, check, verify, order, orient, reconcile, merge, branch,
  // DAG modification
  analyze, modify, modifyAndCommit,
  // Validation
  validateNode, validateGraph,
  // Recovery
  CheckpointManager, AuditTrail,
  // Versioning
  loadDAG, loadDAGFromFile, checkCompatibility, migrateDAG, DAGMigrator,
  // Types
  Graph, NodeSpec, Orientation, ValidationRule, Gap, Connection,
  // ... and more types
} from 'roadmap';
```

Alternatively, for direct protocol access:
```typescript
import { define, verify, check } from 'roadmap/protocol';
```

---

## Core functions

### `define(graph): Graph`
Validates graph structure. Throws if cycles or missing init/term.

```typescript
const g = define(graph({
  id: 'my-project',
  init: 'a', term: 'c',
  nodes: { /* ... */ }
}));
```

### `check(graph): { done, orphans }`
Verify reachability. Returns true if init reaches term.

```typescript
const result = check(g);
if (!result.done) {
  console.log('Orphaned nodes:', result.orphans);
}
```

### `verify(graph): string[]`
Check contracts. Returns errors if consumes not satisfied.

```typescript
const errors = verify(g);
if (errors.length) {
  console.error('Contract violations:', errors);
}
```

### `order(graph): string[]`
Topological sort. Returns execution sequence.

```typescript
const sequence = order(g);
// ['a', 'b', 'c']
```

### `orient(graph, exists): Orientation`
Find current position. Returns first incomplete node.

```typescript
const pos = orient(g, (a) => fileExists(a));
// { position: 'b', produces: ['b.txt'], consumes: ['a.txt'], remaining: ['c'] }
```

### `reconcile(graph, fwd, bwd): Gap[]`
Find gaps between expansion phases.

```typescript
const gaps = reconcile(g, forwardNodes, backwardNodes);
// What's missing to connect them?
```

### `merge(g1, g2, connections): Graph`
Combine DAGs at join points.

```typescript
const merged = merge(roadmapDAG, fusionDAG, [
  { g1Node: 'term', g2Node: 'init', artifact: 'shared.ts' }
]);
```

### `branch(graph, from): Graph`
Extract subgraph from node to term.

```typescript
const variant = branch(g, 'midpoint');
```

---

## Recovery functions

### `CheckpointManager`
Save/restore roadmap state.

```typescript
const cp = new CheckpointManager(repoRoot);

// Save after node completion
await cp.saveCheckpoint({
  position: 'node-id',
  artifacts: ['file1.ts', 'file2.ts'],
  agent: 'my-agent',
  duration: 1234,
  success: true,
});

// Restore on boot
const restore = await cp.restore();
if (restore) {
  position = restore.position;  // Skip completed nodes
}
```

### `AuditTrail`
Log execution evidence.

```typescript
const audit = new AuditTrail(repoRoot);
audit.startSession('my-agent');

audit.record({
  nodeId: 'build',
  status: 'complete',
  duration: 500,
  artifacts: [{ path: 'dist/index.js', hash: 'sha256:...' }],
});

await audit.endSession();
// Writes: AUDIT.md (append), .roadmap/audit/{session}.json
```

---

## Versioning functions

### `loadDAG(rawDAG, options): Graph`
Load with version check + auto-migration.

```typescript
const dag = await loadDAG(oldDAG, {
  autoMigrate: true,      // Default: true
  targetVersion: '0.3.0'  // Default: '0.3.0'
});
// If oldDAG.protocolVersion < 0.3.0, auto-migrates
```

### `checkCompatibility(dagVersion, currentVersion): CompatibilityResult`
Check version compatibility.

```typescript
const compat = checkCompatibility('0.2.0', '0.3.0');
// { compatible: true, needsMigration: true, migrations: ['0.2.0', '0.3.0'] }
```

### `migrateDAG(dag, targetVersion): Graph`
Upgrade DAG to target protocol version.

```typescript
const migrated = migrateDAG(oldDAG, '0.3.0');
```

---

## Validation functions

### `validateNode(graph, nodeId, exists): ValidationResult`
Validate single node.

```typescript
const result = await validateNode(g, 'build', fileExists);
// { passed: true|false, checks: [...], failedReason?: '...' }
```

### `validateGraph(graph, exists): { passed, results, summary }`
Validate all nodes.

```typescript
const validation = await validateGraph(g, fileExists);
// { passed: true|false, results: [...], summary: { total, passed, failed } }
```

---

## Types

```typescript
interface Graph<T> {
  readonly id: string;
  readonly desc: string;
  readonly version: string;              // DAG version
  readonly protocolVersion: string;      // Protocol version
  readonly init: string;
  readonly term: string;
  readonly nodes: Record<T, NodeSpec<T>>;
}

interface NodeSpec<T> {
  readonly id: T;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly deps: readonly T[];
  readonly validate: readonly ValidationRule[];
  readonly idempotent: boolean;          // true=recoverable, false=manual
}

type ValidationRule =
  | { type: 'artifact-exists'; target: string }
  | { type: 'artifact-schema'; target: string; schema: string }
  | { type: 'function'; target: string; fn: string }
  | { type: 'manual-approval'; target: string; reviewer?: string };

interface Orientation {
  readonly position: string;              // Current node
  readonly produces: string[];            // Files to create
  readonly consumes: string[];            // Files available
  readonly remaining: string[];           // Incomplete nodes
}

interface Gap {
  readonly between: [string, string];     // (from, to)
  readonly missing: string[];             // Artifacts missing
}
```

---

## Error handling

All functions throw on invalid input:

```typescript
try {
  define(g);  // Throws if cycles or missing init/term
  verify(g);  // Throws if contracts broken
  check(g);   // Throws if disconnected
} catch (e) {
  console.error('Validation failed:', e.message);
}
```

Load-time versioning errors are explicit:

```typescript
try {
  const dag = await loadDAG(oldDAG, { autoMigrate: false });
} catch (e) {
  // "DAG requires migration from 0.2.0 to 0.3.0"
}
```

---

## Best practices

1. **Always define first**
   ```typescript
   const g = define(graph({ ... }));  // Catches structure errors
   ```

2. **Validate on load**
   ```typescript
   const g = await loadDAG(rawDAG);   // Auto-migrates
   verify(g);                          // Contract check
   ```

3. **Orient at session start**
   ```typescript
   const pos = orient(g, fileExists);  // Where am I?
   ```

4. **Checkpoint after each node**
   ```typescript
   await checkpoint.saveCheckpoint({ position, artifacts, agent, duration, success });
   ```

5. **Audit for evidence**
   ```typescript
   audit.record({ nodeId: pos, status: 'complete', duration, artifacts });
   ```
