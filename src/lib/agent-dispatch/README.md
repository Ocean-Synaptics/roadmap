# agent-dispatch

Sealed brief orchestration system.

## Modules
- dispatch-coordinator: compute batch → assign agents
- agent-executor: sealed brief → execute → handoff
- brief-gate: validate brief contract
- handoff-journal: interim + final handoffs

## Usage
Orchestrator computes dispatch plan. Each agent receives sealed brief only.
