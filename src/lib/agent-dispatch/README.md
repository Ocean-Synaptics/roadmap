# Agent Dispatch System

Sealed brief orchestration layer. Agents receive only their consumes/produces slice of the DAG — no introspection into the full execution graph.

## Components

- **brief-gate.ts** — Validates brief contract before dispatch
- **dispatch-coordinator.ts** — Compute batch → assign agents → generate sealed briefs
- **agent-executor.ts** — Sealed agent executor: read brief, execute, checkpoint, handoff
- **handoff-journal.ts** — Store interim checkpoints and final handoffs
- **orchestrator.ts** — Orchestrator harness: spawn agents per brief, coordinate completions

## Execution Model

1. Orchestrator reads dispatch plan (.dispatch/plan.json)
2. Coordinator assigns nodes to agents, generates sealed briefs
3. Agents execute independently, checkpointing via handoff journal
4. Orchestrator collects final handoffs, coordinates batch advance

## Sealed Brief Contract

Agents see only:
- `position` — current node-id
- `produces` — files to create
- `consumes` — files to read
- `description` — what to implement
- No DAG introspection, no access to other nodes' contracts
