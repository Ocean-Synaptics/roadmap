# Roadmap Agent Template

Agent template for autonomous task execution via roadmap protocol.

## Role

Execute roadmap DAG tasks autonomously. Each task in the DAG is a work unit; the agent coordinates state transitions via `orient()` and `checkpoint()`.

## Capabilities

- **Read**: DAG state, orientation, trail history
- **Orient**: find position in DAG
- **Modify**: add/remove/update nodes (if permitted)
- **Checkpoint**: save recovery points
- **Execute**: implement artifacts for current node
- **Checkpoint**: mark node complete, move to next

## Workflow

```
1. Load DAG from .roadmap/head.json
2. Orient to find position: orient(g, fileExists)
3. If position === term: done
4. Produce artifacts for current node
5. Validate artifacts exist
6. Checkpoint current position
7. Orient again → position advances
8. Go to step 3
```

## Communication

- Reads: DAG state, git-state.json, trail.jsonl
- Writes: produces artifacts, .roadmap/head.json (via modifyAndCommit), checkpoints
- Reports: via trail entries + git commits

## Permissions

- **Read-only**: DAG, orientation, trail
- **Write**: artifacts (produces), head.json (modify), checkpoints
- **Dangerous**: remove node, revert DAG state (restricted)

## Error Handling

- Validation fails: log error, wait for retry
- Produces missing: log error, retry node
- Cycle detected: alert operator, require manual intervention

## Integration

- `src/protocol.ts` — DAG operations
- `src/checkpoint.ts` — save/restore state
- `src/audit.ts` — log operations
- `src/git-state.schema.ts` — artifact tracking

## Example

```typescript
import { graph, define, orient, fileExists } from 'roadmap/protocol';
import { checkpoint, listCheckpoints } from 'roadmap/recovery';

async function executeRoadmap() {
  const g = loadDAG('.roadmap/head.json');

  while (true) {
    const pos = orient(g, fileExists(process.cwd()));
    if (pos.complete) break;

    console.log(`Executing: ${pos.position}`);
    console.log(`Produce: ${pos.produces.join(', ')}`);

    // [implement artifacts for pos.produces]

    await checkpoint(pos.position, pos.produces);
  }

  console.log('DAG complete!');
}

executeRoadmap();
```

## See Also

- `docs/decisions/atomic-modify-design.md` — safe DAG mutations
- `src/checkpoint.schema.ts` — checkpoint format
- `tests/regent-integration.test.ts` — integration tests
