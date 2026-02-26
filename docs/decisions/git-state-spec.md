# Git-State Specification

## Problem

Sessions need to checkpoint state to git and recover from prior commits. Current approach:
- `orient()` reads filesystem artifacts
- No way to query "what artifacts existed at commit X?"
- No way to resume from a checked-in state

## Solution

Store artifact presence as git metadata:
1. After each session, write `.roadmap/git-state.json` mapping artifacts → git refs
2. Add `gitArtifactAt(root, ref)` predicate to check artifact at specific commit
3. Enable recovery: `orient(g, gitArtifactAt(root, 'main'))` finds position at 'main'

## Design

### git-state.json Structure

```json
{
  "version": "1",
  "artifacts": {
    "src/protocol.ts": "abc123",
    "dist/app.js": "def456"
  },
  "checkpoints": {
    "v1.0.0": {
      "commit": "xyz789",
      "timestamp": "2025-02-26T...",
      "position": "done"
    }
  }
}
```

### Semantics

- `artifacts[path]` = git ref where path first appeared (earliest commit)
- `checkpoints[label]` = named recovery point (git ref + position)
- Both are read-only; written by session end

### Usage

```typescript
// Check if artifact exists at specific commit
const check = gitArtifactAt(process.cwd(), 'main');
const pos = orient(g, check);  // position at 'main'

// Or at named checkpoint
const checkpoint = gitArtifactAt(process.cwd(), 'v1.0.0');
const recovery = orient(g, checkpoint);
```

### Integration

1. `orient()` works unchanged — just pass a predicate
2. `CheckpointManager` writes git-state after session
3. `gitArtifactAt()` reads git-state + validates refs
4. Recovery: same `orient()` call, different predicate

## Non-Goals

- Generate diffs or changelogs
- Track file content hashes
- Manage git branches
- Replace git as source of truth (just add structured metadata)

## Rationale

**Why store in git-state.json?**
- Durable, committed with code
- Queryable from any branch/ref
- Self-contained (no external DB)
- Version-safe (embedded schema version)

**Why only earliest ref?**
- Simplest model: artifact exists from first appearance onward
- Matches `check()` reachability: once produced, artifact is stable
- Avoids tracking every commit

**Why checkpoints are optional?**
- git-state.json is auto-generated
- checkpoints[label] are manual recovery points
- Allows labeled snapshots for releases, milestones
