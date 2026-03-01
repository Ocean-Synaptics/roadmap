---
description: "Receipt-first CLI governance: CmdReceipt on every command, scenario chain gating, breakglass receipts, enforcement funnel"
dagId: receipt-first
---

# Tasks: Receipt-First CLI Governance

**Input**: R1–R9 from spec.md, AT-1 through AT-6
**Prerequisites**: existing codebase — src/lib/metaflow/, src/lib/cli-envelope.ts, bin/roadmap.ts

## rf-cmd-receipt: CmdReceipt writer module

Write `CmdReceipt` type and `CmdReceiptWriter` class. Writer creates receipt at `.roadmap/receipts/cmd/<cmd>/<runId>.json` with schema_version, type, cmd, runId, repoRoot, headSha, treeSha, startedAt, endedAt, ok, exitCode, dataSha256, evidence (argv, stdout_sha256, stderr_sha256, artifacts_read, artifacts_written). Writer must emit on both success and failure paths. treeSha from `git write-tree`, headSha fallback.

- produces: src/lib/receipt-first/cmd-receipt.ts
- consumes: src/lib/cli-envelope.ts
- validate: shell:npx tsc --noEmit
- mode: execute

## rf-scenario-registry: Scenario registry + loader

Write `ScenarioRegistry`, `ScenarioDef` types and `loadScenarios()` loader. Registry at `.roadmap/scenarios/SCENARIOS.json`. Each scenario has id, desc, requiredChain (ordered cmd names), gatedCommands. Loader reads file, validates schema, returns typed registry. Include `findScenario(id)` and `isGated(cmd, scenarioId)` helpers.

- depends: rf-cmd-receipt
- produces: src/lib/receipt-first/scenario-registry.ts
- validate: shell:npx tsc --noEmit
- mode: execute

## rf-chain-enforcer: Enforcement funnel

Write `enforceChain()` — the single enforcement path all commands pass through. Steps: load state (headSha/treeSha) → load scenario → load existing receipts for current binding → check active breakglass → enforce chain or breakglass bypass → return go/no-go. On failure: error code `RECEIPT_REQUIRED`, fix array with exact missing commands. Receipt binding validation: compare receipt headSha/treeSha against current — reject drift.

- depends: rf-scenario-registry
- produces: src/lib/receipt-first/chain-enforcer.ts
- consumes: src/lib/receipt-first/cmd-receipt.ts, src/lib/receipt-first/scenario-registry.ts
- validate: shell:npx tsc --noEmit
- mode: execute

## rf-breakglass: Breakglass open/close commands + receipt schema

Write `BreakglassReceipt` type and `roadmap breakglass open/close` CLI commands. Open requires: --ttl (duration), --scope-commands (csv), --scope-invariants (csv), --reason, --evidence, --followups (csv). Writes receipt to `.roadmap/receipts/breakglass/<bg-id>.json`. Close sets closedAt + status=closed. Expiry check: compare expiresAt against now. Active breakglass lookup: scan breakglass dir for open+unexpired receipts.

- depends: rf-cmd-receipt
- produces: src/lib/receipt-first/breakglass.ts, bin/roadmap.ts
- validate: shell:npx tsc --noEmit
- mode: execute

## rf-verify-integration: Verify integration surfacing breakglass

Integrate breakglass status into `roadmap verify` output. When active breakglass exists: show id, status, remaining TTL, scope.commands, scope.invariantsBypassed, outstanding requiredFollowups. When expired: surface as warning with closedAt/expiredAt. After breakglass close: check requiredFollowups satisfied (receipts exist for each).

- depends: rf-breakglass, rf-chain-enforcer
- produces: src/lib/receipt-first/verify-breakglass.ts
- consumes: src/lib/receipt-first/breakglass.ts, src/lib/receipt-first/chain-enforcer.ts
- validate: shell:npx tsc --noEmit
- mode: execute

## rf-tests: Tests for AT-1 through AT-6

Write test suite covering all six acceptance tests. AT-1: command receipt always written (success + failure). AT-2: scenario gating blocks without chain. AT-3: receipt binding rejects stale headSha. AT-4: breakglass bypasses chain for scoped commands. AT-5: expired breakglass treated as inactive. AT-6: verify surfaces active breakglass. Use tmp dirs, mock git state, exercise CmdReceiptWriter + enforceChain + breakglass lifecycle end-to-end.

- depends: rf-verify-integration
- produces: test/receipt-first.test.ts
- consumes: src/lib/receipt-first/cmd-receipt.ts, src/lib/receipt-first/scenario-registry.ts, src/lib/receipt-first/chain-enforcer.ts, src/lib/receipt-first/breakglass.ts, src/lib/receipt-first/verify-breakglass.ts
- validate: shell:npx vitest run test/receipt-first.test.ts
- mode: execute
