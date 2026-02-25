# Real Project Adoption — Integration Pattern

**Status**: Documentation (phase 9, node 4/6)
**Date**: 2026-02-25
**Related**: agent-bootstrap-design.md, example/fusion-roadmap-integration.test.ts

---

## Overview

This document describes how existing projects (fusion, cockpit, etc.) integrate the roadmap library and use executor agents for autonomous execution.

The pattern is: **Project → Roadmap → Executor Agent → Work → Checkpoint → Advance**

---

## Integration Steps

### 1. Project has roadmap.ts

```typescript
// ~/src/fusion/roadmap.ts
import { define, graph } from 'roadmap';

export default define(graph({
  id: 'fusion-project',
  desc: 'Fusion: multi-repo coordinator tool',
  init: 'scaffold',
  term: 'deployed',
  nodes: {
    scaffold: {
      id: 'scaffold',
      desc: 'Scaffold: create project structure',
      produces: ['src/index.ts', 'package.json'],
      consumes: [],
      deps: [],
    },
    protocol: {
      id: 'protocol',
      desc: 'Protocol: define coordination DAG',
      produces: ['src/protocol.ts'],
      consumes: ['src/index.ts'],
      deps: ['scaffold'],
    },
    deployed: {
      id: 'deployed',
      desc: 'Deployed: ready for production',
      produces: [],
      consumes: ['src/protocol.ts'],
      deps: ['protocol'],
    },
  },
}));
```

Roadmap is the **schema**. It defines what should exist.

### 2. Project initializes .roadmap state

```bash
cd ~/src/fusion
roadmap init

# Creates:
#   .roadmap/head.json       ← current DAG (git-tracked)
#   .roadmap/.position       ← current node
#   .roadmap/.handoff/       ← work journal
```

### 3. Executor agent spawns

```typescript
// regent agent: fusion-executor
import RoadmapExecutor from 'roadmap/.claude/agents/roadmap-executor.ts';

async function main() {
  const executor = new RoadmapExecutor(process.cwd());

  // Boot: understand position
  const brief = await executor.getBrief();
  console.log(`Position: ${brief.position}`);
  console.log(`Task: ${brief.description}`);
  console.log(`Pattern: ${brief.pattern}`);

  if (brief.handoff) {
    console.log(`Previous agent learned: ${brief.handoff.summary}`);
  }

  // Work (agent-specific, following brief.pattern)
  // ...build produces list...

  // Checkpoint progress
  await executor.checkpoint({
    progress: 0.5,
    discovered: ["Pattern X works"],
    blockers: [],
    currentFile: "src/index.ts",
  });

  // Complete and advance
  await executor.advance({
    summary: "Scaffold complete",
    keyDecisions: ["TypeScript", "vitest"],
    gotchas: ["Node 18+ required"],
    nextNodeEntry: {
      consumes: ['src/index.ts', 'package.json'],
      ready: true,
    },
  });
}

main().catch(console.error);
```

Agent is **autonomous**. It understands its position, works, and advances without human input.

---

## Agent Lifecycle

```
┌─ Boot ─────────────────┐
│ spawn executor agent    │
│ cd ~/src/fusion         │
│ node executor.ts        │
└──┬──────────────────────┘
   │
   ├─ new RoadmapExecutor(repoRoot)
   │
   ├─ brief = getBrief()
   │  └─ position: "scaffold"
   │  └─ produces: ["src/index.ts", "package.json"]
   │  └─ pattern: "Create project structure..."
   │
   ├─ Work (scaffold node)
   │  └─ Create files matching produces
   │
   ├─ Checkpoint (optional, multiple times)
   │  └─ checkpoint({progress: 0.5, discovered: [...], blockers: [...]})
   │
   └─ Complete
      └─ advance({summary: "...", keyDecisions: [...], gotchas: [...]})
         └─ writes final handoff
         └─ moves position to next node
         └─ next agent sees journal + learnings

┌─ Next Session ──────────┐
│ spawn new executor       │
│ for next node            │
└──┬──────────────────────┘
   │
   ├─ new RoadmapExecutor(repoRoot)
   │
   ├─ brief = getBrief()
   │  └─ position: "protocol"
   │  └─ handoff: previous agent's summary
   │  └─ handoffJournal: previous agent's discoveries
   │
   └─ Continue...
      (knows what previous agent learned)
```

---

## Multi-Agent Coordination

As agents advance through the roadmap:

1. **Agent 1** (scaffold): creates foundational files
   - Discovers: TypeScript setup, build system
   - Checkpoints: 0.3, 0.7, 1.0
   - Advances with handoff: summary + decisions + gotchas

2. **Agent 2** (protocol): defines interfaces, based on Agent 1's work
   - Reads: Agent 1's handoff + work journal
   - Knows: TypeScript working, edge cases from Agent 1
   - Works more efficiently (warm start, prior learnings)
   - Checkpoints: 0.5, 1.0
   - Advances with handoff

3. **Agent 3** (deployed): validates end-to-end
   - Reads: Agent 2's handoff + journal
   - Knows: what was built, what blockers were hit
   - Validates integration
   - Checkpoints: final validation
   - Reaches term node

Result: **Each agent starts warm, not cold.**

---

## Benefits Over Manual/Script Execution

| Aspect | Manual | Script | Executor Agent |
|--------|--------|--------|-----------------|
| Context understanding | "Read roadmap, guess what to do" | Hardcoded (brittle) | getBrief() teaches each time |
| Interrupted work | Lost progress, restart from scratch | State file (complex) | Work journal preserves discoveries |
| Multi-agent handoff | "Who worked on this?" | Task queue metadata | Handoff + journal on disk |
| Progress tracking | Ad-hoc logs | Script-specific | Checkpoint timeline |
| Next agent entry | "What did last person do?" | Check git log | Read handoff + journal |
| Adaptation | Manual (slow) | Not possible | Pattern-driven (responsive) |

---

## Executor Guarantees

**What the executor guarantees**:
- ✓ Position tracking (can't advance without completing node)
- ✓ Work journal preservation (checkpoints are immutable)
- ✓ Handoff validation (required fields before advancing)
- ✓ DAG integrity (bootstrap signature prevents tampering)
- ✓ No wasted context (tight briefs, single API call)

**What agents must do**:
- ✓ Produce all files in `produces` list
- ✓ Satisfy files in `consumes` list (available from predecessors)
- ✓ Provide complete handoff with findings
- ✓ Checkpoint if work might be interrupted

**What agents cannot do** (sealed API):
- ✗ Read full DAG (no dag.nodes access)
- ✗ Skip nodes (sealed position)
- ✗ Erase work (append-only journal)
- ✗ Forge progress (handoff validation)

---

## Observability

Track agent execution through work journals:

```bash
# View work journal for a node
cat .roadmap/.handoff/scaffold.json
# Shows: summary, keyDecisions, gotchas, nextNodeEntry

cat .roadmap/.handoff/scaffold-interim-*.json
# Shows: progression (0.2, 0.5, 0.8, 1.0) with discoveries at each checkpoint

# Check current position
cat .roadmap/.position
# Shows: which node is in progress

# View recent handoffs
ls -lt .roadmap/.handoff/ | head -10
# Shows: most recent work
```

---

## Example: Full Fusion Project Execution

```
[Session 1] Agent 1 (scaffold)
  → getBrief() → "Create project structure"
  → checkpoint(0.5, discovered: ["TypeScript working"])
  → checkpoint(0.8, discovered: ["Build system ready"])
  → advance(summary: "Scaffolded", keyDecisions: ["TypeScript"])
  → Position: scaffold → protocol

[Session 2] Agent 2 (protocol)
  → getBrief() → sees Agent 1's handoff + journal
  → "TypeScript working, edge cases from Node 18+ requirement"
  → checkpoint(0.5, discovered: ["DAG pattern proven"])
  → advance(summary: "Protocol specified", keyDecisions: ["DAG design"])
  → Position: protocol → deployed

[Session 3] Agent 3 (deployed)
  → getBrief() → sees Agent 2's handoff + full journal history
  → "Protocol specified, DAG working, TypeScript proven"
  → validate integration
  → advance(summary: "Ready for production")
  → Position: deployed → term

Result: 3 sessions, autonomous execution, full knowledge transfer between agents
```

---

## Adoption Checklist

- [ ] Project has roadmap.ts (defines INIT and TERM)
- [ ] roadmap.ts validates (check() + verify() pass)
- [ ] .roadmap/head.json tracked in git
- [ ] Executor agent can read roadmap.ts
- [ ] Executor can call getBrief() successfully
- [ ] Executor can write checkpoints
- [ ] Executor can advance (completes node with handoff)
- [ ] Next agent reads previous agent's handoff
- [ ] Full project roadmap executed (INIT → TERM)
- [ ] Work journal shows multi-session progression

---

## Troubleshooting

**"DAG integrity check failed"**
- → Bootstrap signature mismatch (DAG was modified)
- → Verify .roadmap/head.json hasn't been edited manually
- → Delete .roadmap/.bootstrap and restart

**"Position mismatch: tried to advance X but current position is Y"**
- → Agent tried to advance wrong node
- → Verify getBrief() position matches advance() nodeId

**"Handoff incomplete"**
- → Missing required fields (summary, keyDecisions, gotchas, ready)
- → Provide complete handoff before advancing

**"No predecessor produces X"**
- → Consumes references nonexistent artifact
- → Check previous node's produces list
- → Verify roadmap edges are correct (deps)

---

## Future: Multi-Project Coordination

Roadmaps can be merged when projects depend on each other:

```typescript
const fusionRoadmap = readDAG('~/src/fusion/roadmap.ts');
const cockpitRoadmap = readDAG('~/src/cockpit/roadmap.ts');

// Merge at integration point (fusion.protocol → cockpit.bootstrap)
const merged = merge(fusionRoadmap, cockpitRoadmap, [
  { from: 'fusion:protocol', to: 'cockpit:bootstrap' }
]);

// Executor now runs combined roadmap (cross-project execution)
executor = new RoadmapExecutor(repoRoot, merged);
```

See: docs/multi-project-patterns.md
