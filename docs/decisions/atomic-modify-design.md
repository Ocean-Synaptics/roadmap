# Atomic roadmap modifications for concurrent agents

## Problem

Multiple agents executing in parallel need to modify the same roadmap safely:

```
Agent A spawns: analyze(g, 'X')
Agent B spawns: analyze(g, 'X')
[Both analyze before either commits]
Agent A: modify(g, 'X', 'delete') → commits
Agent B: modify(g, 'X', 'delete') → ERROR: already deleted by A
```

Current: modify() works on in-memory graph only. No coordination between agents.

Result: Lost updates, conflicts, inconsistent state across agent sessions.

## Solution: Atomic modify via git commits

Each roadmap modification is a git commit. Changes are ordered, atomic, visible to all agents.

### modifyAndCommit(g, nodeId, action, reason, repoRoot)

**Semantics**: Modify roadmap, commit to git, update audit trail.

**Steps**:
1. modify(g, nodeId, action) → returns modified graph or error
2. If error: fail fast, don't commit
3. If success:
   - Write modified roadmap back to roadmap.ts
   - git commit -m "roadmap: {action} {nodeId} — {reason}"
   - Post-commit hook runs (updates git-state.json)
   - decision() logs to .boot/decisions.jsonl
4. Return modified graph + commit hash

**Result**: Modification is now persistent, visible to all agents via git history.

### Concurrent safety guarantees

**Atomic commitment**:
- Each modify() + commit is atomic
- Once committed, visible to all agents
- On next spawn, agent sees committed roadmap state

**Conflict detection**:
- If Agent A deletes X, commit happens
- Agent B's next spawn reads updated roadmap (X gone)
- B's analyze/modify will see X is missing, adjust

**No locking required** (for initial version):
- Commits are ordered by git history
- First commit wins
- Later agents adapt to modified state

### git-state.json + roadmap versioning

When roadmap is modified:
1. Write new roadmap.ts to disk
2. Git commits it
3. Post-commit hook:
   - Reads new roadmap.ts
   - Computes new roadmap hash (sha256 of content)
   - Writes to git-state.json: `{ roadmapHash, modifications: [...] }`
4. Next agent spawn:
   - Reads git-state.json
   - Detects roadmapHash mismatch → re-imports roadmap.ts
   - Calls orient() with new roadmap version

### Audit trail (.boot/decisions.jsonl)

Each modification creates entry:
```json
{
  "timestamp": 1708876800000,
  "action": "delete",
  "nodeId": "git-state-spec",
  "reason": "Optimization not needed in this phase",
  "evidence": "Profiling shows orient() already fast enough",
  "modifiedBy": "agent-123",
  "commitHash": "abc123def456",
  "graphBefore": { "id": "...", "nodes": {...} },
  "graphAfter": { "id": "...", "nodes": {...} },
  "validation": {
    "define": true,
    "check": { "done": true },
    "verify": []
  }
}
```

### Reconstruction: roadmap state at checkpoint

If agent crashes mid-execution, roadmap can be reconstructed:
1. Read .boot/decisions.jsonl
2. Replay modifications in order
3. Arrive at current roadmap state
4. Resume execution from checkpoint

## Implementation path

### Phase 5.2: Atomic modify (this session)

1. `modifyAndCommit()` function (wraps modify + git operations)
2. Update git-state.json with roadmapHash
3. Audit trail integration
4. Tests: adv-atomic-modify.test.ts

### Phase 6: Conflict resolution + locking (future)

If conflicts arise (two agents both modify X):
1. Detect via git history
2. Re-validate merged graph
3. If valid: accept both modifications
4. If conflict: apply locking strategy

For now: Git's FIFO ordering is sufficient.

## Testing strategy (adv-atomic-modify.test.ts)

| Scenario | Test | Expected |
|----------|------|----------|
| Single agent modify | modify → commit | Roadmap persisted, commit hash returned |
| Concurrent non-overlapping | A deletes X, B deletes Y | Both commits succeed, graph valid |
| Concurrent overlapping | A & B both delete X | First commit succeeds, second fails on re-validate |
| Replay from audit | Read decisions.jsonl, reconstruct | Final roadmap matches committed version |
| Agent sees committed change | A modifies, B spawns next | B reads updated roadmap.ts |

## Next: implementation

See atomic-modify-impl, adv-atomic-modify nodes in roadmap.ts (phase 5.2).
