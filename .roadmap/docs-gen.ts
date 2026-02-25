// Documentation auto-generation from roadmap DAG
// Generates README, SKILL.md, SPEC.md from current graph structure

import type { Graph } from '../src/protocol.ts';

/**
 * Generate README from DAG
 */
export function generateREADME(dag: Graph<string>): string {
  const nodeCount = Object.keys(dag.nodes).length;
  const phases = findPhases(dag);

  return `# ${dag.id}

${dag.desc}

## What This Is

A DAG expansion protocol library. Any repo can depend on this package, define a roadmap, and get typed governance over its development plan.

## Quick Start

\`\`\`typescript
import { define, check, verify, orient } from 'roadmap/protocol';
import roadmap from './roadmap.ts';

// Verify roadmap structure
const valid = check(roadmap);
if (!valid.done) throw new Error('Roadmap not connected');

// Find current position
const position = orient(roadmap, (artifact) => fileExists(artifact));
console.log('Position:', position.position);
console.log('To build:', position.produces);
console.log('Available:', position.consumes);
\`\`\`

## Current Roadmap

- **Nodes**: ${nodeCount}
- **Init**: ${dag.init}
- **Term**: ${dag.term}
- **Phases**: ${phases.length}

${phases.map(p => `### ${p.name}\n\n${p.nodes.map(n => `- **${n}**: ${dag.nodes[n as keyof typeof dag.nodes]?.desc || 'N/A'}`).join('\n')}`).join('\n\n')}

## Protocol Functions

\`\`\`typescript
define(g)           // Validate structure (cycles, init/term)
verify(g)           // Validate contracts (consumes satisfied by predecessors)
check(g)            // Termination (every node reachable init→term)
reconcile(g, fwd, bwd)  // Find where forward.produces meets backward.consumes
order(g)            // Implementation sequence (topo sort)
orient(g, exists)   // Agent reorientation (position from filesystem state)
analyze(g, nodeId)  // Impact analysis (what breaks if we delete this?)
modify(g, nodeId, 'delete')  // Replanning (remove node, re-validate)
merge(g1, g2, connections)   // Combine DAGs at join points
branch(g, from)     // Extract subgraph from node to term
\`\`\`

## Documentation

See SKILL.md for protocol expansion workflow.
See SPEC.md for system specification.

## Installation

\`\`\`
npm install roadmap
\`\`\`
`;
}

/**
 * Generate SKILL.md (protocol spec + expansion workflow)
 */
export function generateSKILL(dag: Graph<string>): string {
  return `# Roadmap Protocol Expansion Skill

## Protocol Stack

\`\`\`
define(g)               validate structure (cycles, init/term)
verify(g)               validate contracts (consumes satisfied by predecessors)
check(g)                termination (every node reachable init→term)
reconcile(g, fwd, bwd)  find where forward.produces meets backward.consumes
order(g)                implementation sequence (topo sort)
orient(g, exists)       agent reorientation (position from filesystem state)
analyze(g, nodeId)      impact analysis (what breaks if we delete this?)
modify(g, nodeId, 'delete') replanning (remove node, re-validate)
merge(g1, g2, connections)  combine DAGs at join points
branch(g, from)         extract subgraph from node to term
modifyAndCommit(...)    atomic modification via git commit
\`\`\`

## Expansion Protocol (RECURSE)

When expanding a roadmap:

1. **Define INIT and TERM** — what exists vs. what should exist
2. **EXPAND backward from TERM** — what must immediately precede it?
3. **FLIP and EXPAND forward from INIT** — what can we build first?
4. **RECONCILE** — reconcile(g, fwd, bwd) finds where produces meets consumes
5. **RECURSE into gaps** — sub-expand coarse nodes at finer granularity
6. **VALIDATE** — define() + check() + verify() on modified graph
7. **COMMIT** — advance() writes new DAG to git

## Agent Bootstrap Loop

\`\`\`typescript
// Agent runs roadmap.ts to get current position
const roadmap = await readHeadDAG(repoRoot);
const pos = orient(roadmap, existsSync);

// Execute current node
execute(roadmap.nodes[pos.position]);

// Complete: commit changes
await advance(repoRoot, modifiedDAG, 'reason');

// Next spawn: roadmap.ts reads updated DAG
// Cycle repeats until pos.position === roadmap.term
\`\`\`

## Adoption Directive

Point an agent at a roadmap:

\`\`\`
ADOPT_ROADMAP: /path/to/roadmap.ts
\`\`\`

Agent runs:
\`\`\`typescript
const manifest = await getReconciliationManifest(repoRoot);
const merged = await adoptRoadmap(agentState, manifest.graph);
\`\`\`

## Types

\`\`\`typescript
interface NodeSpec<TAll, TSelf> {
  id: TSelf;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: TAll[];
}

interface Graph<T extends string> {
  id: string;
  desc: string;
  init: string;
  term: string;
  nodes: { [N in T]: NodeSpec<T, N> };
}

interface Orientation {
  position: string;
  produces: string[];
  consumes: string[];
  remaining: string[];
  done: string[];
}
\`\`\`
`;
}

/**
 * Generate SPEC.md (system specification)
 */
export function generateSPEC(dag: Graph<string>): string {
  return `# Roadmap System Specification

## Architecture

A roadmap is a **bidirectional DAG** (init = current state, term = verified intent) expanded forward and backward simultaneously until reconcile() finds where produces meets consumes.

This is the **minimal complete specification for autonomous agent execution**.

## Core Invariants

1. **Acyclic** — no circular dependencies (caught by define())
2. **Connected** — every node reachable from init to term (caught by check())
3. **Contract-satisfied** — every consume is produced by a predecessor (caught by verify())
4. **Deterministic** — order(g) produces same topo sort every time
5. **Idempotent** — orient(g, exists) returns same position across runs (if filesystem unchanged)

## Protocol Semantics

### define(g)
- Validates graph structure
- Detects cycles (Kahn's algorithm)
- Ensures init and term are defined
- Returns g if valid, throws if invalid

### verify(g)
- Checks every node's consumes are satisfied by predecessors
- Returns list of violations (empty if valid)
- Independent of define() — can detect different class of errors

### check(g)
- Validates termination: every node reachable from init
- Every node can reach term (directly or transitively)
- Returns { done: boolean, orphans?: string[] }

### reconcile(g, fwd, bwd)
- Finds join points between forward lane and backward lane
- Returns connections (where produces meets consumes)
- Returns gaps (what's missing to connect them)

### orient(g, exists)
- Finds current position: first node where produces don't exist
- Returns Orientation with position, produces, consumes, remaining
- Used by agents to find next work

### analyze(g, nodeId)
- Impact analysis: what breaks if we delete this node?
- Returns { dependents, orphaned, safe }
- No side effects

### modify(g, nodeId, 'delete')
- Remove node from DAG
- Re-validate with define() + check() + verify()
- Returns modified graph or error
- Original graph unchanged (immutable)

### merge(g1, g2, connections)
- Combine two DAGs at reconciliation points
- connections: array of { g1Node, g2Node, artifact }
- Re-validates merged result
- Returns unified graph with shared init/term

## Agent Execution Model

1. **Boot** → orient(roadmap, fsCheck)
2. **Position** → pos.position = current node
3. **Execute** → build pos.produces, consume pos.consumes
4. **Commit** → git commit (triggers post-commit hook)
5. **Advance** → git-state.json updated, next spawn reads new DAG
6. **Loop** → until pos.position === roadmap.term

## Git-Native State Machine

- Current DAG: .roadmap/head.json (git-tracked snapshot)
- History: git log -- .roadmap/head.json (all past DAGs)
- Deterministic: git history is ordered
- Recoverable: checkout any commit to get historical DAG

## Concurrency Model

Multiple agents modify same roadmap via atomic git commits:

1. Agent A: modify(g, X, delete) → commit
2. Agent B: spawns, reads committed DAG (X already gone)
3. No locking needed: git history orders modifications
4. First-commit wins: later agents adapt to committed state

## Validation Stack

| Layer | What it catches | When |
|-------|----------------|------|
| tsc --noEmit | Invalid dep refs, missing nodes | Compile time |
| define(g) | Cycles, missing init/term | Import time |
| verify(g) | Consumed artifact not produced | On demand |
| check(g) | Disconnected nodes, unreachable | On demand |
| orient(g, exists) | Position from filesystem | Session start |

## Guarantees

- **Termination** (check) — all nodes either done or reachable
- **Contract satisfaction** (verify) — all deps satisfied before execution
- **Acyclicity** (define) — no circular work
- **Determinism** (order) — same execution sequence always
- **Idempotence** (orient) — same position if state unchanged
- **Atomicity** (modifyAndCommit) — all-or-nothing DAG updates
`;
}

/**
 * Helper: find phases in DAG
 */
function findPhases(
  dag: Graph<string>,
): Array<{ name: string; nodes: string[] }> {
  const phases: { [key: string]: string[] } = {};
  let currentPhase = 'Unclassified';

  for (const [id, node] of Object.entries(dag.nodes)) {
    if ((node as any).id.includes('-term')) {
      const phaseName = (node as any).id.replace('-term', '').toUpperCase();
      currentPhase = phaseName;
      if (!phases[currentPhase]) phases[currentPhase] = [];
    } else {
      if (!phases[currentPhase]) phases[currentPhase] = [];
      phases[currentPhase].push(id);
    }
  }

  return Object.entries(phases).map(([name, nodes]) => ({
    name,
    nodes: nodes.slice(0, 5), // Limit to first 5 per phase for brevity
  }));
}
