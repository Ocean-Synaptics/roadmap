---
description: "Receipt-first CLI governance: CmdReceipt on every command, scenario chain gating, breakglass receipts, enforcement funnel"
dagId: receipt-first
---

# Tasks: Receipt-First CLI Governance

**Input**: R1–R9 from spec.md, AT-1 through AT-6
**Prerequisites**: existing codebase — src/lib/metaflow/, src/lib/cli-envelope.ts, bin/roadmap.ts

## Phase 1: Foundation (parallel)

- [P1] rf-cmd-receipt: CmdReceipt writer module. CmdReceipt type + CmdReceiptWriter class. Writer creates receipt at .roadmap/receipts/cmd/<cmd>/<runId>.json with schema_version, type, cmd, runId, repoRoot, headSha, treeSha, startedAt, endedAt, ok, exitCode, dataSha256, evidence (argv, stdout_sha256, stderr_sha256, artifacts_read, artifacts_written). Emits on both success and failure. treeSha from git write-tree, headSha fallback.
  - depends: init
  - produces: src/lib/receipt-first/cmd-receipt.ts
  - consumes: src/lib/cli-envelope.ts
  - validate: shell:npx tsc --noEmit

- [P1] rf-breakglass: Breakglass open/close commands + receipt schema. BreakglassReceipt type with id, openedAt, closedAt, expiresAt, scope (commands[], invariantsBypassed[]), reason, evidence, requiredFollowups[], status. roadmap breakglass open requires --ttl, --scope-commands, --scope-invariants, --reason, --evidence, --followups. Writes to .roadmap/receipts/breakglass/<bg-id>.json. Close sets closedAt + status=closed. Expiry check: expiresAt vs now. Active lookup: scan breakglass dir for open+unexpired.
  - depends: init
  - produces: src/lib/receipt-first/breakglass.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: Chain Logic

- [P2] rf-scenario-registry: Scenario registry + loader. ScenarioRegistry and ScenarioDef types. Registry at .roadmap/scenarios/SCENARIOS.json. Each scenario: id, desc, requiredChain (ordered cmd names), gatedCommands. loadScenarios() reads + validates schema. findScenario(id) and isGated(cmd, scenarioId) helpers.
  - depends: rf-cmd-receipt
  - produces: src/lib/receipt-first/scenario-registry.ts
  - validate: shell:npx tsc --noEmit

- [P2] rf-chain-enforcer: Enforcement funnel. enforceChain() — single enforcement path: load state (headSha/treeSha) → load scenario → load existing receipts for current binding → check active breakglass → enforce chain or breakglass bypass → return go/no-go. Failure: RECEIPT_REQUIRED error code, fix array with exact missing commands. Binding validation: receipt headSha/treeSha vs current, reject drift.
  - depends: rf-scenario-registry, rf-breakglass
  - produces: src/lib/receipt-first/chain-enforcer.ts
  - consumes: src/lib/receipt-first/cmd-receipt.ts, src/lib/receipt-first/scenario-registry.ts, src/lib/receipt-first/breakglass.ts
  - validate: shell:npx tsc --noEmit

## Phase 3: Integration

- [P3] rf-verify-integration: Verify integration surfacing breakglass. Integrate breakglass status into roadmap verify output. Active breakglass: show id, status, remaining TTL, scope, outstanding requiredFollowups. Expired: surface as warning. After close: check requiredFollowups satisfied (receipts exist for each).
  - depends: rf-chain-enforcer
  - produces: src/lib/receipt-first/verify-breakglass.ts
  - consumes: src/lib/receipt-first/breakglass.ts, src/lib/receipt-first/chain-enforcer.ts
  - validate: shell:npx tsc --noEmit

## Phase 4: Tests

- [P4] rf-tests: Tests for AT-1 through AT-6. AT-1: command receipt always written (success + failure). AT-2: scenario gating blocks without chain. AT-3: receipt binding rejects stale headSha. AT-4: breakglass bypasses chain for scoped commands. AT-5: expired breakglass treated as inactive. AT-6: verify surfaces active breakglass. tmp dirs, mock git state, exercise full lifecycle.
  - depends: rf-verify-integration
  - produces: test/receipt-first.test.ts
  - consumes: src/lib/receipt-first/cmd-receipt.ts, src/lib/receipt-first/scenario-registry.ts, src/lib/receipt-first/chain-enforcer.ts, src/lib/receipt-first/breakglass.ts, src/lib/receipt-first/verify-breakglass.ts
  - validate: shell:npx vitest run test/receipt-first.test.ts
