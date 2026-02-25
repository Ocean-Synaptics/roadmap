# AUDIT.md: Agent execution evidence trail

## Problem

Multi-agent execution needs accountability:
- Which agents ran which phases?
- When did each phase complete?
- What artifacts were produced?
- Did validation pass?
- What failed, and why?

Without audit trails, recovery and debugging are blind.

## Solution: AUDIT.md (executed phases + receipts)

Central audit log at project root: `AUDIT.md`

```markdown
# Project Audit Trail

## Session 1 (2026-02-25 10:15:30)

Agent: roadmap-agent-0

| Phase | Status | Duration | Artifacts | Hash | Validator |
|-------|--------|----------|-----------|------|-----------|
| init | ✓ | 0.1s | src/protocol.ts | sha256:abc... | artifact-exists |
| bootstrap-gen-spec | ✓ | 0.2s | docs/decisions/... | sha256:def... | artifact-exists |
| multi-repo-pattern | ✓ | 0.5s | docs/multi-repo-... | sha256:ghi... | artifact-exists |
| checkpoint-spec | ✗ | timeout | — | — | manual-approval |

## Session 2 (2026-02-25 10:20:00)

Agent: roadmap-agent-1 (recovery)

Restoring from: cp-20260225-102000

| Phase | Status | Duration | Action | Result |
|-------|--------|----------|--------|--------|
| checkpoint-spec | ✓ | 0.3s | manual-review | approved |
| audit-spec | ✓ | 0.4s | generated | hash validated |
```

## Schema

AUDIT.md is **append-only markdown**:

```
# {project} Audit Trail

## Session {N} ({timestamp})
Agent: {agent-id}
[Restored-from: {checkpoint-id}]

| Phase | Status | Duration | Artifacts | Notes |
|-------|--------|----------|-----------|-------|
| {node-id} | {✓/✗} | {ms} | {path1, path2} | {evidence} |
```

Per-session file: `.roadmap/audit/{session-id}.json` (machine-readable)

```json
{
  "sessionId": "session-20260225-102000",
  "agent": "roadmap-agent-0",
  "start": 1735124130000,
  "end": 1735124250000,
  "restoredFrom": null,
  "entries": [
    {
      "nodeId": "init",
      "status": "complete",
      "duration": 100,
      "artifacts": [{ "path": "src/protocol.ts", "hash": "sha256:..." }],
      "validation": { "type": "artifact-exists", "passed": true }
    }
  ],
  "summary": { "total": 5, "passed": 5, "failed": 0 }
}
```

## Integration points

### After each node completion
```typescript
await auditLog.record({
  nodeId: position.position,
  status: 'complete',
  duration: Date.now() - nodeStart,
  artifacts: position.produces.map(p => ({
    path: p,
    hash: await gitHash(p)
  })),
  validation: validationResult
});
```

### On agent boot
```typescript
const audit = new AuditTrail(repoRoot);
await audit.startSession(agent.name, checkpoint?.id);
```

### On session end
```typescript
await audit.endSession();
await audit.writeMD(AUDIT.md);  // Append-only
await audit.writeJSON(audit/{sessionId}.json);
```

## Queries (read-only)

```typescript
// Which agents ran?
const agents = audit.getAgents();

// Which phases failed?
const failed = audit.getFailedPhases();

// Timeline: when did each phase complete?
const timeline = audit.getTimeline();

// Evidence: what passed each validation?
const evidence = audit.getEvidence('artifact-exists');
```

## Constraints

- **Append-only**: never modify AUDIT.md, only append
- **Immutable hashes**: artifacts validated at completion, hash can't change
- **Session isolation**: each agent session separate entry
- **No secrets**: audit doesn't log API keys, credentials (validated separately)

## Testing

Adversarial tests (audit-trail.test.ts):

| Scenario | Test | Expectation |
|----------|------|------------|
| Write entry | Record node completion | Entry in JSON + MD |
| Append MD | Two sessions | MD has both chronologically |
| Query failed | Phase failed validation | Query returns it |
| Restore evidence | Restore from CP, audit shows it | "Restored from cp-..." in session |
| No secrets | Log artifact hash | Hash only, not content |

## Future: Evidence linking

Each audit entry links to:
- Checkpoint (if restoration)
- Git commits (hash of commit that produced artifact)
- Agent identity (who approved manual-approval?)
- Regent role (which authorization level ran this?)

```json
{
  "nodeId": "build",
  "evidence": {
    "checkpoint": "cp-20260225-101530",
    "gitCommit": "a1b2c3d4...",
    "agent": "roadmap-agent-0",
    "regent": "regent-root"
  }
}
```

AUDIT.md becomes **proof of execution** — not just what happened, but why and by whom.
