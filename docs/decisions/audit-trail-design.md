# Audit Trail Design

## Problem

Sessions need visibility into what happened:
- Which nodes completed in which order
- Which artifacts were produced and when
- Who made modifications (in multi-agent scenarios)
- Why did execution stall or fail

Current approach: session trail records commands, but not internal state transitions.

## Solution

Provide audit trail mechanism:
- Record every `orient()` call with position + produces/consumes
- Record every DAG modification with operator + change
- Record every checkpoint with label + artifacts
- Store in `.roadmap/trail.jsonl` (local) and `~/.roadmap/trail.jsonl` (global)

Trail entries form a complete session log: who did what, when, and what state changed.

## Design

### Trail Entry Structure

```json
{
  "timestamp": "2025-02-26T10:30:45Z",
  "type": "orient",
  "position": "phase-2-term",
  "produces": ["dist/app.js"],
  "consumes": ["src/main.ts"],
  "done": 15,
  "remaining": 10,
  "session": "uuid-...",
  "operator": "claude-sonnet"
}
```

### Entry Types

**orient**: Session checkpoint
```json
{ "type": "orient", "position": "...", "produces": [...], "done": N, "remaining": M }
```

**modify**: DAG change (add/remove/update node)
```json
{ "type": "modify", "operation": "add", "nodeId": "...", "commit": "abc123" }
```

**checkpoint**: Recovery point created
```json
{ "type": "checkpoint", "label": "v1.0.0", "position": "...", "commit": "abc123" }
```

**restore**: Checkpoint restored
```json
{ "type": "restore", "label": "v1.0.0", "position": "...", "commit": "def456" }
```

**merge**: DAGs merged
```json
{ "type": "merge", "g1": "proj-a", "g2": "proj-b", "position": "...", "commit": "ghi789" }
```

**error**: Operation failed
```json
{ "type": "error", "operation": "orient", "code": "CYCLE_DETECTED", "context": {...} }
```

### Storage

**Local trail** (`.roadmap/trail.jsonl`):
- Per-repo session history
- Written after each operation
- Archived at session end

**Global trail** (`~/.roadmap/trail.jsonl`):
- Cross-repo execution history
- All operations from all repos
- Never archived (append-only log)

### Queries

```typescript
// Get recent operations
trail.last(10);
// → last 10 entries from local trail

// Filter by type
trail.filter({ type: 'modify' });
// → all DAG modifications

// Timeline of positions
trail.filter({ type: 'orient' }).map(e => e.position);
// → sequence of positions visited

// Find failures
trail.filter({ type: 'error' });
// → all failed operations

// Per-operator summary
trail.groupBy('operator').map(op => op.entries.length);
// → operations per agent
```

### Semantics

Trail entries are:
- **Immutable**: once written, never modified
- **Ordered**: chronological by timestamp
- **Complete**: every operation is recorded
- **Queryable**: JSON lines format, easy to filter/analyze
- **Auditable**: includes operator, timestamp, change details

### Concurrency

Multiple sessions writing to `.roadmap/trail.jsonl`:
- Each appends new entries (no overwrites)
- Order is FIFO (filesystem provides atomicity per-line)
- Global trail is single append-only log (no conflicts)

## Non-Goals

- Real-time streaming (logged after operation completes)
- Structured replay (trail is read-only, no replay mechanism)
- Automatic cleanup (user responsibility, keep trail as audit log)
- Encryption (assume safe filesystem)

## Rationale

**Why JSONL?**
- Line-based (each entry is complete and parseable)
- Append-only (no rewriting required)
- Human-readable (debug-friendly)
- Tool-friendly (standard format)

**Why local + global trails?**
- Local: per-repo history (relevant to that project)
- Global: cross-project audit (who changed what, where)
- Separation: local can be archived, global is durable

**Why post-operation?**
- Consistent state (only write after success)
- Atomic per-operation (no partial entries)
- Safe (failure doesn't corrupt trail)

## Integration

- Every `orient()` writes trail entry
- Every modification writes trail entry
- Session starts with timestamp entry
- Trail --archive compresses local, leaves global
- Session trail visible via `roadmap trail` command
