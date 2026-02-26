# Checkpoint & Restore Design

## Problem

Sessions need to save and restore state:
- Save after completing a phase: `checkpoint('v1.0.0')`
- Restore to checkpoint: `restore('v1.0.0')` if later phase fails
- Enable recovery without re-running early work

Current approach: git commits track state, but no explicit checkpoint mechanism.

## Solution

Provide checkpoint/restore operations:
1. **checkpoint(label)**: save current position + artifacts
2. **restore(label)**: load checkpoint, reset DAG to that position
3. Checkpoints stored in `.roadmap/checkpoints/` as JSON + git-state
4. Session trail records checkpoint operations

## Design

### Checkpoint Structure

```
.roadmap/checkpoints/
├── v1.0.0/
│   ├── state.json          # DAG position + metadata
│   ├── git-state.json      # Artifacts at checkpoint
│   └── manifest.json       # Checkpoint metadata
├── v1.1.0/
│   └── ...
```

### state.json

```json
{
  "label": "v1.0.0",
  "position": "phase-2-term",
  "timestamp": "2025-02-26T10:30:00Z",
  "commit": "abc123def456",
  "artifacts": {
    "src/main.ts": true,
    "dist/app.js": true
  }
}
```

### Operations

```typescript
// Create checkpoint
const cp = await checkpoint('v1.0.0');
// → writes .roadmap/checkpoints/v1.0.0/state.json
// → commits to git with message "checkpoint: v1.0.0"

// Restore checkpoint
const restored = await restore('v1.0.0');
// → resets `.roadmap/head.json` to checkpoint state
// → resets filesystem if needed (optional)
// → returns new orientation

// List checkpoints
const checkpoints = await listCheckpoints();
// → reads .roadmap/checkpoints/

// Describe checkpoint
const desc = await describeCheckpoint('v1.0.0');
// → shows position, artifacts, timestamp
```

### Semantics

**checkpoint(label)**:
1. Get current position via `orient()`
2. Get current artifacts (from git-state.json)
3. Write `.roadmap/checkpoints/{label}/state.json`
4. Commit to git
5. Return checkpoint metadata

**restore(label)**:
1. Load `.roadmap/checkpoints/{label}/state.json`
2. Update `.roadmap/head.json` to match checkpoint position
3. (Optional) check which artifacts need to be restored
4. Return new orientation
5. Commit restore operation to git

### Storage

Checkpoints are:
- **Committed**: part of git history, durable
- **Labeled**: human-readable (v1.0.0, release, stable)
- **Lightweight**: only store position + metadata, not artifacts
- **Reversible**: restore is just a commit to an earlier state

### Concurrency

Multiple sessions can create checkpoints:
- Each creates `.roadmap/checkpoints/{label}/`
- Names should be unique (timestamp + label)
- Restore blocks other sessions until complete

## Non-Goals

- Automatic snapshots (manual checkpoints only)
- Cleanup of old checkpoints (user responsibility)
- Artifact versioning (git handles artifact history)
- Cross-repo checkpoint coordination (per-repo checkpoints)

## Rationale

**Why .roadmap/checkpoints/?**
- Durable (committed to git)
- Discoverable (filesystem structure)
- Self-contained (no external DB)

**Why not just use git tags?**
- Checkpoints contain position + metadata, not just commit hash
- More structured than free-form git tags
- Easier to track checkpoint context

**Why restore is a commit?**
- Creates audit trail of recovery operations
- Prevents silent state changes
- Enables rollback of restore if needed

## Integration

- Session trail records checkpoint operations
- git-state.json is updated atomically with checkpoint
- Recovery flows: restore(label) → orient() → continue
