# API Surface Documentation

Complete reference for all roadmap modules and exports.

## Main Entry (roadmap)

Full API, backward compatible.

```typescript
import {
  // Core
  define, verify, check, order, parallelOrder, orient, reconcile, branch, merge,
  // Recovery
  CheckpointManager, AuditTrail,
  // Predicates
  fileExists, siblingArtifactExists, gitArtifactAt, any,
  // Validation
  validateNode, validateGraph,
  // Versioning
  loadDAG, migrate,
  // Types
  Graph, NodeSpec, Orientation, Brief,
} from 'roadmap';
```

## Sub-Entries

### roadmap/protocol
Core DAG operations.

```typescript
import { define, verify, check, order, parallelOrder, orient, reconcile, branch, merge } from 'roadmap/protocol';
```

### roadmap/recovery
Checkpoint and audit.

```typescript
import { CheckpointManager, AuditTrail } from 'roadmap/recovery';
```

### roadmap/predicates
Artifact detection.

```typescript
import { fileExists, siblingArtifactExists, gitArtifactAt, any } from 'roadmap/predicates';
```

### roadmap/agent
Sealed API for agents.

```typescript
import { getBrief, advance, checkpoint, restore } from 'roadmap/agent';
```

## Types

- `Graph<T>` — DAG structure
- `NodeSpec<T, N>` — Node definition
- `Orientation` — Position + remaining work
- `Brief` — Current work for agents
- `Checkpoint` — Saved milestone
- `RoadmapError` — Structured errors

## CLI

```bash
roadmap orient --note "reason"
roadmap chart [--deps]
roadmap validate --note "reason"
roadmap trail [--last N] [--global] [--repo NAME]
roadmap integrate --auto | --guided
roadmap checkpoint --label NAME
roadmap restore --label NAME
```

See `bin/roadmap-integrate.ts` for implementation.
