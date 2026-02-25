# checkpoint: Save/restore roadmap state for recovery + replay

## Problem

Current execution is linear: agent boots, orients, creates produces, commits, advances.

But multi-phase projects have failure modes:
- Agent crashes mid-phase → work lost
- Network fails → commit doesn't push
- Merge conflict → need to restart
- Regression discovered → want to rollback to checkpoint

Strategy: **checkpoint + restore**
- checkpoint: save roadmap position + artifacts + commit state
- restore: reload from checkpoint, skip completed phases

## Solution: checkpoint.json + restore operations

### Checkpoint schema

```json
{
  "id": "cp-20260225-101530",
  "timestamp": 1735124130000,
  "roadmapPosition": "build",
  "phase": "build",
  "artifacts": [
    { "path": "src/protocol.ts", "hash": "sha256:abc123..." },
    { "path": "dist/index.js", "hash": "sha256:def456..." }
  ],
  "gitState": {
    "branch": "master",
    "headHash": "a1b2c3d4...",
    "clean": true
  },
  "metadata": {
    "agent": "roadmap-agent-0",
    "phase": "build",
    "duration": 1234,
    "success": true
  }
}
```

Stored at: `.roadmap/checkpoints/cp-{timestamp}.json` (git-tracked)

### Integration with orient()

```typescript
// At boot, check for latest checkpoint
const checkpoint = await readLatestCheckpoint(repoRoot);

if (checkpoint && checkpoint.roadmapPosition) {
  // Restore: skip to checkpoint position
  const position = checkpoint.roadmapPosition;
  console.log(`Restoring from checkpoint ${checkpoint.id} at ${position}`);
} else {
  // Normal: orient fresh
  const position = orient(dag, exists);
}
```

### Restore guarantee

If artifacts at checkpoint still exist (validated by schema hashes):
- Restore skips re-running phases
- Directly continue from checkpoint node
- Fast recovery: O(N) = N nodes skipped

If artifacts missing:
- Fallback to orient() (computes fresh position)
- All idempotent nodes are re-runnable
- Non-idempotent nodes: restore fails (manual intervention)

## Deployment phases

### Phase A: Checkpoint recording (this node)
1. Write `.roadmap/checkpoints/cp-{id}.json` after each node completion
2. Validate artifact hashes
3. Include git state + agent metadata

### Phase B: Restore logic
1. Read latest checkpoint
2. Validate artifacts still exist
3. Skip completed nodes, resume from checkpoint
4. Idempotent guarantee + validation layer = self-healing

### Phase C: Audit trail
1. `.roadmap/audit.json` records all checkpoints + restores
2. Evidence: when agents restarted, from which checkpoint, result
3. Enables debugging + replay

## Constraints

- Checkpoints are **append-only**: never modify, only create new ones
- Artifact hashes are **immutable proof**: if file changed after checkpoint, restore detects it
- Non-idempotent nodes **can't be skipped**: restore fails if trying to skip manual-approval nodes
- Latest checkpoint is **authority**: orient() checks it first

## Testing

Adversarial tests (checkpoint-caching.test.ts):

| Scenario | Test | Expectation |
|----------|------|------------|
| Write checkpoint | Complete node, write CP | Hash matches, CP valid |
| Restore valid | CP artifacts exist | Skip to position, continue |
| Restore missing artifact | Delete file, restore | Fallback to orient() |
| Invalid checkpoint | Corrupt hash in CP | Validation fails, ignore, orient() |
| Checkpoint after failure | Agent crashes mid-phase | Latest CP before crash, can restore |
| Skip non-idempotent | Try to restore past manual | Restore fails, requires manual approval |

## Next phases

1. **checkpoint-impl**: write/read checkpoint logic
2. **audit-spec**: design audit trail
3. **regent-integration**: integrate with multi-agent coordinator
