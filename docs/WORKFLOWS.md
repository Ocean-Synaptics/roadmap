# User workflows — three personas

## 1. Consumer project (most common)

**Goal:** Use roadmap library to track my project phases.

### Install
```bash
npm install ../roadmap
```

### Setup (2 min)
```bash
npx roadmap generate-bootstrap \
  --project my-app \
  --desc "TypeScript library" \
  --init src/index.ts,package.json \
  --term dist/index.js
git add roadmap.ts boot.ts .roadmap/
git commit -m "feat: add roadmap"
```

### Use
```typescript
import { loadDAG, orient } from 'roadmap/protocol';
import roadmap from './roadmap.ts';

const dag = await loadDAG(roadmap);
const pos = orient(dag, exists);
console.log(`Current: ${pos.position}`);
```

**Exports:** loadDAG, orient, types

---

## 2. Agent/orchestrator

**Goal:** Autonomous execution with checkpoint + recovery.

```typescript
import { loadDAG, orient, CheckpointManager, AuditTrail } from 'roadmap/protocol';

const checkpoint = new CheckpointManager(repoRoot);
const audit = new AuditTrail(repoRoot);
audit.startSession('my-agent');

// Restore or orient fresh
let pos = (await checkpoint.restore())?.position || orient(dag, exists).position;

while (pos !== dag.term) {
  // create artifacts...
  await checkpoint.saveCheckpoint({ position: pos, artifacts, agent: 'my-agent', duration, success: true });
  audit.record({ nodeId: pos, status: 'complete', duration, artifacts });
  pos = orient(dag, exists).position;
}

await audit.endSession();
```

**Exports:** loadDAG, orient, CheckpointManager, AuditTrail, types

---

## 3. Developer (extending roadmap)

**Goal:** Build on protocol.

```typescript
import { define, graph, check, verify, merge, branch } from 'roadmap/protocol';

const g = define(graph({ ... }));
check(g) && verify(g);
```

**Exports:** define, graph, check, verify, order, orient, reconcile, merge, branch, types, versioning

---

## Public API

**Core:**
- loadDAG, loadDAGFromFile
- orient, order, merge, branch
- define, graph, check, verify, reconcile
- validateNode, validateGraph

**Recovery:**
- CheckpointManager
- AuditTrail

**Versioning:**
- checkCompatibility, migrateDAG
- DAGMigrator

**Types:**
- Graph, NodeSpec, Orientation
- ValidationRule, Gap, Connection
- GitState, Checkpoint
- VersionInfo, CompatibilityResult

**NOT exported (internal):**
- detectCycles, fwd (cycle detection)
- Flat type (internal)
- Migration helpers
- Hash implementation
