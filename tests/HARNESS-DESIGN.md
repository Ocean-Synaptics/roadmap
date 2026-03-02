# Hardening Test Harness — Design Document

## Overview

The hardening test harness orchestrates integration testing for the five roadmap hardening components:
1. **HeadSha Recovery** — auto-detect and fix git HEAD mismatches
2. **Preflight Validation** — state coherence checks before operations
3. **Trail Management** — atomic trail.jsonl handling with auto-commit
4. **DAG Switching** — validate consistency when switching DAGs
5. **Artifact Gates** — validation gates for completion

The harness provides:
- **Mock implementations** for all five components (allows test prep while modules are being developed)
- **Fixture setup** with reproducible test git repos
- **Scenario orchestration** for multi-step test flows
- **Component coordination** for testing interactions between modules

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│         HardeningTestOrchestrator                        │
│  (coordinates all 5 components + fixtures)              │
└────────┬────────────────────────────────────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │         ComponentRegistry                  │
    │  {headsha, trail, preflight, dagSwitch,   │
    │   artifactGates}                          │
    └────────────────────────────────────────────┘
         │
    ┌────┴─────────────────────────────────────────┐
    │          TestFixture                         │
    │  (isolated git repo with .roadmap structure) │
    └──────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `hardening-test-harness.ts` | Core harness: mocks, fixture builder, orchestrator, scenario definitions |
| `hardening-harness-examples.test.ts` | Usage examples: how to use mocks, scenarios, and component coordination |
| `roadmap-hardening-integration.test.ts` | Final integration tests (uses harness once real modules available) |

## Mock Components

Each mock implements the expected interface for its real module:

### MockHeadShaRecovery
```typescript
detectMismatch(): { hasMismatch, reason, actualGitSha }
autoRecover(): { recovered, newHeadSha }
validateConsistency(): { consistent, errors }
```

### MockTrailManager
```typescript
appendEntry(entry): void
autoCommit(): { committed, entriesAdded }
```

### MockPreflightValidator
```typescript
validate(requiredArtifacts): { valid, missing }
checkGitState(): { coherent, issues }
```

### MockDAGSwitcher
```typescript
listAvailableDAGs(): string[]
switchDAG(dagId): { success, error? }
validateDAGStructure(dagId): { valid, errors }
```

### MockArtifactGates
```typescript
gateCompletion(requiredArtifacts): { allowed, blockedBy }
validateArtifactSchema(path, schema): { valid, errors }
```

## Fixture Setup

`createTestFixture(name)` creates an isolated test environment:

```typescript
const fixture = createTestFixture('my-test');
// fixture.repoRoot         — temporary git repo
// fixture.headJsonPath     — .roadmap/head.json
// fixture.gitStatePath     — .roadmap/git-state.json
// fixture.trailPath        — .roadmap/trail.jsonl
// fixture.commit(msg)      — atomic git commit
// fixture.getCurrentSha()  — current git HEAD
// fixture.cleanup()        — delete temp repo
```

## Test Scenarios

Five predefined scenarios cover the acceptance criteria:

### Scenario 1: HeadSha Mismatch → Recovery → Success
```
1. Create mismatch (corrupt git-state.json)
2. Detect mismatch (headsha.detectMismatch)
3. Recover (headsha.autoRecover)
4. Verify fixed (headsha.detectMismatch → no mismatch)
```

### Scenario 2: Missing Artifacts → Preflight Gate → Blocked
```
1. Check preflight (fails — artifacts missing)
2. Create artifact
3. Commit artifact
4. Check preflight (passes)
```

### Scenario 3: Trail Changes → Auto-Commit → No Friction
```
1. Append trail entry
2. Auto-commit trail
3. Append another entry
4. Auto-commit again
```

### Scenario 4: DAG Switch → Validate → Orient Correctly
```
1. Switch DAG
2. Validate git state
3. Commit DAG change
```

### Scenario 5: End-to-End Workflow
```
1. Create mismatch
2. Detect & recover
3. Create artifact
4. Commit
5. Append trail entry
6. Auto-commit trail
7. Validate everything
```

## Usage Pattern

```typescript
import { createTestFixture, HardeningTestOrchestrator, HARDENING_SCENARIOS } from './hardening-test-harness';

// Single scenario test
it('tests scenario 1', async () => {
  const fixture = createTestFixture('my-test');
  const orchestrator = new HardeningTestOrchestrator(fixture);

  const result = await orchestrator.runScenario(HARDENING_SCENARIOS[0]);

  expect(result.passed).toBe(true);
  orchestrator.cleanup();
});

// Multi-component test
it('coordinates headsha + trail', async () => {
  const fixture = createTestFixture('coordination-test');
  const orchestrator = new HardeningTestOrchestrator(fixture);
  const { headsha, trail } = orchestrator.getComponents();

  // Detect mismatch
  const mismatch = headsha.detectMismatch();
  expect(mismatch.hasMismatch).toBe(true);

  // Recover
  const recovery = headsha.autoRecover();
  expect(recovery.recovered).toBe(true);

  // Log to trail
  trail.appendEntry({ event: 'recovered', ts: new Date().toISOString() });
  const commit = trail.autoCommit();
  expect(commit.committed).toBe(true);

  orchestrator.cleanup();
});
```

## Module Integration Checklist

When real modules are implemented, swap mocks for real implementations:

- [ ] HeadSha recovery module ready
  - Export `HeadShaRecovery` class with `detectMismatch()`, `autoRecover()`, `validateConsistency()`
  - Update import in harness: `import { HeadShaRecovery } from '../src/lib/roadmap/headsha-recovery'`
  - Tests will use real module automatically

- [ ] Trail manager module ready
  - Export `TrailManager` class with `appendEntry()`, `autoCommit()`
  - Update import in harness
  - Tests will use real module automatically

- [ ] Preflight validator module ready
  - Export `PreflightValidator` class with `validate()`, `checkGitState()`
  - Update import in harness
  - Tests will use real module automatically

- [ ] DAG switcher module ready
  - Export `DAGSwitcher` class with `switchDAG()`, `validateDAGStructure()`
  - Update import in harness
  - Tests will use real module automatically

- [ ] Artifact gates module ready
  - Export `ArtifactGates` class with `gateCompletion()`, `validateArtifactSchema()`
  - Update import in harness
  - Tests will use real module automatically

## Design Rationale

### Why Mocks?
- Allows integration test harness to be built in parallel with module development
- Tests can run against mocks while modules are incomplete
- Mocks define the expected interfaces — guides module implementation
- Once real modules are ready, swap in without changing test code

### Why Fixture Builder?
- Provides reproducible, isolated test environment
- Each test gets its own temp git repo — no side effects
- Cleanup is automatic via fixture.cleanup()
- Simplifies test setup — one function call instead of manual repo setup

### Why Orchestrator?
- Coordinates multi-step scenarios (mismatch → recovery → validation)
- Manages component initialization and coordination
- Tracks scenario success/failure across all steps
- Provides scenario definitions that document acceptance criteria

### Why Scenarios?
- Document the five key integration paths
- Testable acceptance criteria (each scenario has expected outcome)
- Can be executed in parallel
- Serve as living documentation of system behavior

## Example: Adding a New Scenario

```typescript
const newScenario: HardeningScenario = {
  id: 'scenario-custom',
  name: 'Custom Behavior',
  description: 'Tests new behavior',
  steps: [
    { action: 'create-artifact', config: { path: 'src/new.ts', content: '...' } },
    { action: 'validate', config: { type: 'custom' } },
  ],
  expectedOutcome: 'Custom behavior works',
};

// Then add to HARDENING_SCENARIOS array
HARDENING_SCENARIOS.push(newScenario);

// And test it
it('tests custom scenario', async () => {
  const fixture = createTestFixture('custom');
  const orchestrator = new HardeningTestOrchestrator(fixture);
  const result = await orchestrator.runScenario(newScenario);
  expect(result.passed).toBe(true);
  orchestrator.cleanup();
});
```

## Next Steps

1. ✅ Harness designed and implemented (mocks + fixtures + orchestrator)
2. ✅ Scenario definitions created (5 scenarios covering all acceptance criteria)
3. ⏳ Modules implemented by respective agents
4. ⏳ Mock → Real module swap (straightforward import changes)
5. ⏳ Full integration tests run (final acceptance criteria validation)

## Notes

- All test repos are temporary and cleaned up automatically
- Mocks are synchronous for simplicity (real modules may be async)
- Scenarios are designed to be executable in parallel (no shared state)
- The harness is designed to scale: new components can be added without changing core orchestrator
