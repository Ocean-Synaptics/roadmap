# Multi-Project Coordination Patterns

**Status**: Documentation (phase 9, node 5/6)
**Date**: 2026-02-25
**Related**: real-project-adoption.md, merge() operation

---

## Overview

Multiple projects can coordinate through roadmap DAG composition. This document describes patterns for:

1. **Sequential execution**: Project A → Project B (A finishes, B starts)
2. **Merged execution**: A + B in single coordinated DAG (A and B have dependencies)
3. **Parallel branches**: Multi-team execution on same codebase

---

## Pattern 1: Sequential Projects

Two independent roadmaps executed in sequence.

```
Project A (fusion)
├─ scaffold      → produces lib.ts
├─ protocol      → produces protocol.ts
└─ deployed

Project B (cockpit)
├─ bootstrap     → consumes fusion's lib.ts
├─ dashboard     → consumes protocol.ts
└─ deployed
```

**Workflow**:
1. Executor Agent 1 completes Project A (scaffold → protocol → deployed)
2. Agent 1 writes final handoff: "Fusion ready, API stable"
3. Executor Agent 2 boots on Project B
4. Agent 2 reads Agent 1's handoff (discovers API design, gotchas)
5. Agent 2 completes Project B (bootstrap → dashboard → deployed)

**Implementation**:
```typescript
// Session 1: Fusion project
const executor1 = new RoadmapExecutor('~/src/fusion');
const fusionDag = await executor1.getBrief(); // execute A fully

// Session 2: Cockpit project
const executor2 = new RoadmapExecutor('~/src/cockpit');
const cockpitDag = await executor2.getBrief(); // can see fusion's handoff via env/git
```

**Benefits**: Simple, no DAG coupling, agents work independently

---

## Pattern 2: Merged Execution (Cross-Repo Dependency)

When Project B depends on Project A's artifacts at a contract point.

```
Merged DAG
├─ fusion:scaffold       → produces lib.ts
├─ fusion:protocol       → produces protocol.ts
├─ cockpit:bootstrap     → consumes lib.ts + protocol.ts
├─ cockpit:dashboard     → consumes bootstrap artifacts
└─ cockpit:deployed
```

**Use merge()** to combine DAGs at the contract point:

```typescript
import { merge, define, check, verify } from 'roadmap';

const fusionRoadmap = readDAG('~/src/fusion/roadmap.ts');
const cockpitRoadmap = readDAG('~/src/cockpit/roadmap.ts');

// Specify connection: fusion's finished state → cockpit's entry
const connections = [
  { from: 'fusion:protocol', to: 'cockpit:bootstrap', artifacts: ['protocol.ts'] }
];

// Merge (no ID conflicts; caller pre-qualifies)
const merged = merge(fusionRoadmap, cockpitRoadmap, connections);

// Validate merged graph
console.assert(check(merged).done, 'DAG must be fully connected');
console.assert(verify(merged).length === 0, 'All contracts must be satisfied');

// Execute with merged DAG
const executor = new RoadmapExecutor(repoRoot, merged);
const brief = await executor.getBrief(); // position computed from merged DAG
```

**merge() guarantees**:
- ✓ Acyclic (no cycles introduced)
- ✓ Connected (init → term reachable)
- ✓ Contracts satisfied (consumes met by produces)
- ✗ No implicit renaming (IDs must be globally unique)

**Caller responsibility**:
- Declare connection points explicitly
- Ensure node IDs don't conflict (or handle renaming before merge)
- Verify merged DAG validates

---

## Pattern 3: Parallel Branches (Same Repo)

Multiple independent work streams on the same codebase, can later merge.

```
Roadmap with branches
├─ [ Main path ]
│  ├─ scaffold
│  ├─ core
│  └─ deploy-main
│
└─ [ Feature branch ]
   ├─ scaffold (shared)
   ├─ feature
   └─ deploy-feature

Merge at: scaffold → core/feature split, reunite at deploy
```

**Use branch()** to extract independent subgraph:

```typescript
// Split into two parallel lanes
const mainLane = branch(dag, 'core'); // extract core → deploy-main
const featureLane = branch(dag, 'feature'); // extract feature → deploy-feature

// Agents work independently
const mainExecutor = new RoadmapExecutor(repoRoot, mainLane);
const featureExecutor = new RoadmapExecutor(repoRoot, featureLane);

// Later merge when ready
const merged = merge(mainLane, featureLane, [
  { from: 'core:final', to: 'feature:integration' }
]);
```

---

## Multi-Repo Publishing Pattern

Projects can publish sub-roadmaps to npm for consumption.

```
Project A (published as @org/fusion-roadmap)
├─ roadmap.ts          ← exported from package.json "roadmap" field
└─ package.json
   "exports": {
     "./roadmap": "./roadmap.ts"
   }

Project B (consumer)
├─ package.json
│  "devDependencies": { "@org/fusion-roadmap": "^1.0" }
└─ roadmap.ts
   import { fusionRoadmap } from '@org/fusion-roadmap';
   export const myRoadmap = merge(fusionRoadmap, localRoadmap, connections);
```

**Benefits**:
- A publishes stable roadmap
- B imports and extends it
- Versions tracked via npm
- No copy-paste, single source of truth

---

## Agent Coordination Across Projects

When agents work on merged DAGs:

```
[Session 1] Agent 1 on merged DAG
  position: fusion:scaffold
  → getBrief()
  → work (scaffold fusion)
  → advance()
  → position: fusion:protocol

[Session 2] Agent 2 on merged DAG
  position: fusion:protocol
  → getBrief() sees Agent 1's handoff
  → work (write protocol)
  → advance()
  → position: cockpit:bootstrap

[Session 3] Agent 3 on merged DAG
  position: cockpit:bootstrap
  → getBrief() sees Agent 2's handoff + Agent 1's journal
  → work (bootstrap cockpit, knows fusion's API)
  → advance()
  → position: cockpit:deploy
```

**Key insight**: Work journal transfers knowledge across project boundaries. Agents don't need to read other projects' docs—they read the prior agent's discoveries.

---

## Merge Gotchas

**Node ID Conflicts**
```
Problem:
  fusionRoadmap: {init, term, spec, impl, ...}
  cockpitRoadmap: {init, term, bootstrap, ...}
  → merge() will fail (duplicate 'init', 'term')

Solution 1: Pre-rename before merge
  cockpitRoadmap.nodes = renameNodes(cockpitRoadmap.nodes, 'ckpt-');
  merge(fusion, cockpit, ...)

Solution 2: Use fully qualified names in connections
  connections = [{from: 'fusion:protocol', to: 'cockpit:bootstrap'}]
  // Caller responsible for ensuring names are unique
```

**Unsatisfied Contracts**
```
Problem:
  cockpit:bootstrap consumes 'api.ts'
  But fusion:protocol doesn't produce 'api.ts'

Solution:
  1. Check producer in fusion roadmap
     fusion:protocol should produce 'api.ts' (not 'protocol.ts')
  2. Or add intermediary node to rename/adapt artifacts
```

**Cycles**
```
Problem:
  A → B (via connection)
  B → A (implicit in dependencies)
  → merge() detects cycle

Solution:
  1. Audit connections for reverse edges
  2. Restructure roadmaps to avoid cycles
  3. Use branch() instead of merge() if possible
```

---

## Decision Tree: Which Pattern to Use?

```
Do projects have dependencies?
├─ No
│  └─ Use Sequential (Pattern 1)
│     "Execute A, then B, independently"
│
├─ Yes, at contract point
│  └─ Use Merged (Pattern 2)
│     "A's output → B's input, coordinated DAG"
│
└─ Yes, multiple paths
   └─ Use Parallel + Merge (Pattern 3)
      "Work in parallel, merge when dependencies met"
```

---

## Observability

Track multi-project execution:

```bash
# View current position in merged DAG
cat .roadmap/.position
# → "fusion:protocol" or "cockpit:bootstrap"

# See which project the agent is in
cat .roadmap/head.json | jq '.nodes | keys | map(select(startswith("fusion:")))'
# → [fusion:scaffold, fusion:protocol, ...]

# Trace handoff across project boundary
cat .roadmap/.handoff/fusion:protocol.json
# → summary, keyDecisions, gotchas
cat .roadmap/.handoff/cockpit:bootstrap.json
# → summary (mentions "fusion's API confirmed stable")
```

---

## Future: Dynamic Composition

Roadmaps could dynamically merge based on:
- Config flags (feature flags → different subgraph)
- Runtime state (discovered capability → new branch)
- External dependencies (library version → compatible subgraph)

Current: static at merge time
Future: dynamic compositions, adaptive execution
