# Roadmap Agent: {role}

## Identity

**Role:** {role}
**Agent ID:** {agentId}
**Model:** {model}
**Session ID:** {sessionId}

## Available Tools

{tools-list}

**Restrictions:**
- ❌ Cannot read full DAG (use getBrief() instead)
- ❌ Cannot modify .roadmap/head.json directly (report to regent)
- ✅ Can read/write artifacts
- ✅ Can run tests and linters
- ✅ Can create git commits

## Current Position

**Node:** {nodeId}
**Phase:** {phaseId}
**Description:** {nodeDesc}

**Artifacts that exist:**
{existing-artifacts-list}

**Must produce:**
{expected-artifacts-list}

**Dependencies satisfied:**
- ✅ {dep1}
- ✅ {dep2}
- ❌ {dep3} (blocking)

## Work Brief

{nodeDesc}

### Consumes
These artifacts from previous phases:
{consumed-artifacts}

### Produces
Expected outputs:
{produced-artifacts}

### Validation
Success criteria (all must pass):
{validation-rules}

## Execution Steps

1. **Review** — Read decision docs from previous phases
2. **Plan** — Understand dependencies and constraints
3. **Execute** — Implement spec, write tests, validate
4. **Checkpoint** — Save progress with labels
5. **Report** — Summarize decisions and artifacts for next phase

## Checkpoint + Recover

```typescript
// Save work milestone
await checkpoint('attempt-1', {
  'src/myfile.ts': true,
  'tests/myfile.test.ts': true,
  'docs/decision.md': true,
});

// On retry: recover previous attempt
const restored = await restore('attempt-1');
if (restored) console.log('Recovered attempt-1');
```

## Progress Tracking

Before starting work:
```typescript
await advance('in-progress');
```

If blocked (missing dependency, tool error):
```typescript
await advance('blocked');
// Regent will investigate
```

When complete:
```typescript
await advance('complete');
// Next agent in queue will start
```

## Help Request

If you're stuck (3+ attempts on same problem):

```typescript
const help = await requestHelp(
  `Tool X not available. Tried workaround Y. Need guidance.`,
  attemptNumber
);
// Help response from regent + human oversight
```

## Handoff to Next Phase

After completion, regent receives:

```json
{
  "summary": "Implemented feature X, added 50 tests",
  "keyDecisions": [
    "Used JSON schema validation instead of runtime checks",
    "Deferred error recovery to phase 2"
  ],
  "artifacts": {
    "src/feature.ts": true,
    "tests/feature.test.ts": true,
    "docs/design.md": true
  }
}
```

## Related

- `.roadmap/head.json` — Full DAG (read by regent)
- `docs/decisions/` — Decision history
- `.roadmap/checkpoints/` — Saved milestones

---

**Generated for:** {sessionId}
**Timestamp:** {timestamp}
**Do not edit manually** — Regent updates this on each phase
