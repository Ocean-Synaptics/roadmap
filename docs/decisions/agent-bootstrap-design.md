# Agent Bootstrap Design

## Problem

Roadmap execution needs autonomous agents that can:
1. Read the DAG and understand their position
2. Execute phase work (spec, test, implement)
3. Checkpoint progress safely
4. Recover from errors
5. Request help when blocked

Current approach: manual DAG interpretation. Agents need sealed API that hides graph details.

## Solution: Agent Bootstrap Process

### Roles

1. **Agent** — Executes roadmap phases
   - Cannot introspect full DAG
   - Only sees: current brief, next steps, previous work
   - Reports position via handoff

2. **Regent** — Coordinates agents
   - Holds full DAG
   - Orchestrates agent launch + task queues
   - Enforces safety policies

### Sealed Agent API

```typescript
// Brief: what the agent knows about current work
interface Brief {
  readonly nodeId: string;
  readonly desc: string;
  readonly produces: readonly string[];
  readonly consumes: readonly string[];
  readonly handoffs: readonly Handoff[];  // Previous phase outputs
}

// Handoff: output from previous phase
interface Handoff {
  readonly fromNode: string;
  readonly summary: string;
  readonly keyDecisions: string[];
  readonly artifacts: readonly string[];
  readonly timestamp: string;
}

// Agent methods
export interface Agent {
  // Current work (read-only)
  getBrief(): Brief;

  // Checkpoints (safe recovery)
  checkpoint(label: string, artifacts: Record<string, boolean>): Promise<void>;
  restore(label: string): Promise<boolean>;

  // Progress tracking
  advance(status: 'in-progress' | 'blocked' | 'complete'): Promise<void>;

  // Help request
  requestHelp(context: string, attempt: number): Promise<string>;
}
```

### Execution Flow

```
Agent Spawn
  ↓
Read manifest (role, skills, allowed tools)
  ↓
Load brief (protocol position + artifacts)
  ↓
Check dependencies satisfied?
  ├─ No: block with reason
  └─ Yes: continue
  ↓
Execute phase work:
  - Read decision docs
  - Write spec/tests/code
  - Validate artifacts
  ↓
Checkpoint (mark complete)
  ↓
Report handoff (summary + artifacts)
  ↓
Regent advances DAG position
```

### Error Handling

| Scenario | Action |
|----------|--------|
| Artifact validation fails | Retry, checkpoint attempt |
| Dependency missing | Block, notify regent |
| Tool not in manifest | Fail, report |
| Help requested (3+ attempts) | Escalate to human |

### Bootstrap File

Agents receive `.claude/agents/{role}.md`:

```markdown
# Roadmap Agent: {role}

## Identity
- Role: {role}
- Tools available: {list}
- Can use tools: {yes|no}

## Current Brief
[Generated from DAG position]

## Next Steps
[From roadmap node spec]

## Success Criteria
[From node validation rules]

## Error Handling
[Escalation paths]
```

## Implementation

Phase 9 (agent-executor-impl):
1. Write Agent interface
2. Implement getBrief() from DAG + filesystem
3. Implement checkpoint/restore with audit trail
4. Add regent coordination

## Related

- `.claude/agents/roadmap-executor-template.md` — template for generated manifests
- `src/agent.ts` — sealed API implementation
- Regent enforcement — policy gates for agent operations
