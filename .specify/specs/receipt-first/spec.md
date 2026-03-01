# Receipt-First CLI Governance — Specification

## R1: CmdReceipt on every command

Every CLI command writes a `CmdReceipt` to `.roadmap/receipts/cmd/<cmd>/<runId>.json`. Written on success and failure. Fields:

```typescript
interface CmdReceipt {
  schema_version: 1;
  type: 'cmd-receipt';
  cmd: string;
  runId: string;
  repoRoot: string;
  headSha: string;
  treeSha?: string;
  startedAt: string;   // ISO
  endedAt: string;      // ISO
  ok: boolean;
  exitCode: number;
  dataSha256: string;   // sha256 of JSON.stringify(data) from envelope
  evidence: {
    argv: string[];
    stdout_sha256: string;
    stderr_sha256: string;
    artifacts_read: string[];
    artifacts_written: string[];
  };
  scenario?: string;    // scenario id if --scenario was passed
}
```

## R2: Scenario registry + chain gating

Scenario definitions live at `.roadmap/scenarios/SCENARIOS.json`. Each scenario declares a required receipt chain — an ordered list of commands that must have receipts for the current state binding before the scenario's gated commands will execute.

```typescript
interface ScenarioRegistry {
  schema_version: 1;
  scenarios: Record<string, ScenarioDef>;
}

interface ScenarioDef {
  id: string;
  desc: string;
  requiredChain: string[];   // ordered cmd names that must have receipts
  gatedCommands: string[];   // commands that require the chain
}
```

Commands accept `--scenario <id>`. When set, the enforcer loads the scenario, checks that all `requiredChain` entries have receipts bound to the current headSha/treeSha, and blocks execution with `RECEIPT_REQUIRED` if any are missing.

## R3: Receipt state binding

Receipt binding is cryptographic. `treeSha` (from `git write-tree`) is preferred; `headSha` is fallback when treeSha is unavailable. Chain validation compares receipt binding against current repo state — drift rejects the chain.

## R4: Default failure mode

When a scenario gate fails, the error code is `RECEIPT_REQUIRED`. The `error.fix` array contains the exact commands needed to produce the missing receipts, in order.

## R5: Breakglass receipt

Breakglass is a receipt, not a flag. Commands: `roadmap breakglass open` and `roadmap breakglass close`.

```typescript
interface BreakglassReceipt {
  schema_version: 1;
  type: 'breakglass';
  id: string;           // bg-<timestamp>
  openedAt: string;     // ISO
  closedAt?: string;    // ISO, set by close
  expiresAt: string;    // ISO, TTL-derived
  scope: {
    commands: string[];           // which commands are unblocked
    invariantsBypassed: string[]; // which invariants are suspended
  };
  reason: string;
  evidence: string;
  requiredFollowups: string[];   // commands that must run after close
  status: 'open' | 'closed' | 'expired';
}
```

Stored at `.roadmap/receipts/breakglass/<bg-id>.json`.

## R6: Breakglass bounds

- TTL is required — no open-ended breakglass
- Scope is required — must name commands and invariants
- `roadmap verify` surfaces active breakglass with remaining TTL and outstanding follow-ups

## R7: Breakglass invariants

Even during breakglass:
- Receipt writing cannot be bypassed (every command still writes CmdReceipt)
- `roadmap complete` must still bind to repo state
- After `breakglass close`, all `requiredFollowups` must be satisfied before next scenario-gated command

## R8: Env-variable bypass removal

Remove env-variable bypass surfaces from allow-decisions. `SKIP_BATCH_COMMIT` and similar env reads become informational annotations in receipts — they no longer gate or skip enforcement logic.

## R9: Enforcement funnel

All commands go through a single enforcement path:

1. Load repo state (headSha, treeSha)
2. Load scenario (if `--scenario` passed)
3. Load existing receipts for current state binding
4. Check active breakglass (scope, TTL, status)
5. Enforce chain requirements (or breakglass bypass)
6. Run the command
7. Emit CmdReceipt (success or failure)
8. Update receipt pointers

## Acceptance Tests

### AT-1: Command receipts always written

Given any CLI command (orient, complete, validate, chart, etc.)
When the command executes (success or failure)
Then a CmdReceipt exists at `.roadmap/receipts/cmd/<cmd>/<runId>.json`
And the receipt contains correct argv, timing, exit code, and state binding

### AT-2: Scenario gating blocks free-run

Given a scenario `strict-deploy` requiring chain `[orient, validate, complete]`
When `roadmap complete --scenario strict-deploy` runs without prior orient+validate receipts
Then the command fails with `RECEIPT_REQUIRED`
And `error.fix` lists the missing commands in order

### AT-3: Receipt binding rejects drift

Given receipts from headSha `abc123`
When the repo advances to headSha `def456`
Then scenario chain validation rejects the stale receipts
And requires fresh receipts bound to the current state

### AT-4: Breakglass enables bounded bypass

Given an active breakglass with `scope.commands: ['complete']`
When `roadmap complete --scenario strict-deploy` runs (missing chain)
Then the command succeeds (breakglass bypasses the chain requirement)
And a CmdReceipt is still written (receipt writing is never bypassed)

### AT-5: Breakglass expires

Given an active breakglass with TTL expired
When a gated command runs
Then the breakglass is treated as inactive
And the command fails with `RECEIPT_REQUIRED`

### AT-6: Verify surfaces breakglass

Given an active breakglass
When `roadmap verify` runs
Then the output includes breakglass status, remaining TTL, scope, and outstanding follow-ups
