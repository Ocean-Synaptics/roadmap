---
description: "FR-RM-AUDIT-STACK — Process audit (010) + CLI compliance (012) + MetaFlow self-insertion sovereignty (013) as mandatory terminal gates"
dagId: fr-rm-audit-stack
---

# Tasks: FR-RM-AUDIT-STACK

**Input**: src/lib/metaflow/ (types, fs, miner, mine-run, opt-dag, receipt-writer, session-store), bin/roadmap.ts, src/lib/render/, src/lib/import/, src/lib/completion-context.ts
**Goal**: Three-spec stack: (1) mining + display/integration detectors as required terminal gate for any DAG mutation; (2) 100% CLI command coverage for display receipts with CI enforcement; (3) MetaFlow auto-insertion — eligible commands auto-wrapped, surface header required, PE-002 detector closes the gap. No env bypass anywhere. completed.json commits are deterministic and orchestrator-proof.

## Phase 0: Init

- [P0] rm-audit-contract: Existing codebase — src/lib/metaflow/ (all modules), bin/roadmap.ts, src/lib/render/, src/lib/import/
  - produces: src/lib/metaflow/types.ts, src/lib/metaflow/miner.ts, bin/roadmap.ts

## Phase 1: Contract + Schema (010)

- [P1] rm-audit-schema: REQUIRED.json contract + TypeScript schema + operator docs. **`src/lib/metaflow/audit/required-schema.ts`**: types `AuditContract` ({ schema_version:1, version:string, thresholds:{ latencyP95MaxMs:number, toolCallInflationMax:number, orientChurnMax:number }, requiredDetectors:string[], requiredTerminalNodeId:string, bindFields:['treeSha','sessionIds','runId'] }), `AuditReport` ({ schema_version:1, runId, treeSha, sessionIds:string[], computedAt:string, passed:boolean, detectorResults:DetectorResult[] }), `DetectorResult` ({ code:string, passed:boolean, evidence:string[], fix:string[] }), `AuditReceipt` ({ schema_version:1, runId, treeSha, sessionIds:string[], passed:boolean, reason?:string, reportPath:string, emittedAt:string }). **`.roadmap/metaflow/audit/REQUIRED.json`**: `{ schema_version:1, version:"1.0.0", thresholds:{ latencyP95MaxMs:5000, toolCallInflationMax:10, orientChurnMax:3 }, requiredDetectors:["RD-001","RD-002","RD-003","IR-001","IR-002","IR-003","IR-004","IR-005","PE-001","PE-002","MF-001","MF-002","MF-003","MF-004","MF-005"], requiredTerminalNodeId:"intent-metaflow-audit-required", bindFields:["treeSha","sessionIds","runId"] }`. **`docs/metaflow/AUDIT_REQUIRED.md`**: operator contract — what each detector checks, failure→fix steps, how to wire audit tail into a new spec, exemption taxonomy.
  - depends: rm-audit-contract
  - produces: src/lib/metaflow/audit/required-schema.ts, .roadmap/metaflow/audit/REQUIRED.json, docs/metaflow/AUDIT_REQUIRED.md
  - validate: shell:npx tsc --noEmit

## Phase 2: Audit Engine (010)

- [P2] rm-audit-engine: Core audit engine. **`src/lib/metaflow/audit/audit.ts`**: `runAudit(runId, detectors, opts:{base?,treeSha?,sessionIds?})` → reads REQUIRED.json thresholds, reads MiningResult via readMining(), runs each detector, builds AuditReport, writes `.roadmap/metaflow/audit/<runId>.json`, writes AuditReceipt via writeAuditReceipt(), returns AuditReport. `loadRequired(base?)` → reads REQUIRED.json. **`src/lib/metaflow/audit/report.ts`**: `buildReport(runId, treeSha, sessionIds, results, contract)` → AuditReport; `renderReport(report, opts:RenderOpts)` → string: per-detector table (code | ✅/❌ | evidence snippet | fix[0]), summary line (N/M passed), PASSED/FAILED banner. **`src/lib/metaflow/audit/receipt.ts`**: `writeAuditReceipt(runId, treeSha, sessionIds, report, base?)` → AuditReceipt to `.roadmap/receipts/audit-<runId>.json`; `readAuditReceipt(runId, base?)` → AuditReceipt; `auditReceiptExists(runId, base?)` → boolean. **Test** `tests/audit/audit-engine.test.ts`: 6 tests — all-passing detectors → passed:true receipt; one failing → passed:false; report render contains PASSED/FAILED banner; receipt written to correct path; loadRequired reads thresholds; treeSha+sessionIds bound in output.
  - depends: rm-audit-schema
  - produces: src/lib/metaflow/audit/audit.ts, src/lib/metaflow/audit/report.ts, src/lib/metaflow/audit/receipt.ts, tests/audit/audit-engine.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/audit-engine.test.ts

## Phase 3: Detectors + Completion Fix (parallel, 010)

- [P3] rm-audit-detectors-display: Rich display regression detectors RD-001..003. **`src/lib/metaflow/audit/detectors/display.ts`**: exports `detectDisplayRegression(receipts:InteractionReceipt[], opts:{required?:string[]})` → `DetectorResult[]`. **RD-001** `detectMissingTable`: for receipts where cmd includes orient/chart/gantt/mine/verify AND audience==='user' — check render.plainPath file contains at least one `|`; fail if absent. **RD-002** `detectMissingDagRender`: for orient/chart receipts — check plain render contains at least one of: `L0`, `L00`, `conflict`, `critical`; fail if none. **RD-003** `detectMissingProgressBar`: for complete/chart receipts — check plain render contains `█`, `░`, or `[`; fail if missing. Each returns `{code, passed, evidence:string[], fix:string[]}`. **Test** `tests/audit/display-detectors.test.ts`: 8 tests — RD-001 passes with table; fails without; RD-002 passes with batch markers; fails without; RD-003 passes with bar; fails without; detectDisplayRegression returns 3 results; all-pass on well-formed fixture.
  - depends: rm-audit-engine
  - produces: src/lib/metaflow/audit/detectors/display.ts, tests/audit/display-detectors.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/display-detectors.test.ts

- [P3] rm-audit-detectors-integration: Integration rough point detectors IR-001..005 + PE-001. **`src/lib/metaflow/audit/detectors/integration.ts`**: exports `detectIntegrationRoughPoints(receipts, sessions, miningResult, opts:{base?,repoRoot?})` → `DetectorResult[]`. **IR-001** `detectMissingPlanReceipt`: check `.roadmap/receipts/PLAN_SELECTED.json` exists and headSha matches `git rev-parse HEAD`; fail if absent or mismatched. **IR-002** `detectAuthorityMarker`: check `.roadmap/git-state.json` activePlan matches current dag id; fail if null or mismatched. **IR-003** `detectReceiptChainGaps`: scan receipts for receipt-required command (COMMAND_REGISTRY) without a matching InteractionReceipt for that stepId; fail if count > 0. **IR-004** `detectCompletedDrift`: `git status --porcelain .roadmap/completed.json` — if dirty AND last-commit mtime for completed.json older than its file mtime → finding. **IR-005** `detectToolCallHotspots`: check MiningResult hotspots for count > contract.thresholds.toolCallInflationMax OR latencyP95Ms > latencyP95MaxMs. **PE-001** `detectProcessEscape`: if `.roadmap/metaflow/runs/` exists AND any receipt cmd not in COMMAND_REGISTRY and not `roadmap mf *` → finding. **Test** `tests/audit/integration-detectors.test.ts`: 8 tests — IR-001 passes with valid PLAN_SELECTED; IR-002 passes with matching activePlan; IR-004 fires on dirty completed.json (mock git); IR-005 fires on high hotspot count; IR-005 fires on high latency; PE-001 fires on unregistered command; all pass on clean fixture; 6 detectors returned total.
  - depends: rm-audit-engine
  - produces: src/lib/metaflow/audit/detectors/integration.ts, tests/audit/integration-detectors.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/integration-detectors.test.ts

- [P3] rm-completion-autocommit: Deterministic completion commits. **`src/lib/completion/auto-commit.ts`**: `isCompletionDirty(repoRoot)` → runs `git status --porcelain .roadmap/completed.json .roadmap/receipts/` via execSync, returns boolean. `autoCommitCompletion(nodeId, repoRoot)` → if dirty: `git add .roadmap/completed.json .roadmap/receipts/` then `git commit --no-verify -m "roadmap: auto-commit completion state — <nodeId>"`; on success return `{committed:true}`; on failure write non-passing AuditReceipt with reason `completion-autocommit-failed` return `{committed:false,receipt}`; if clean return `{committed:false,reason:'nothing-dirty'}`. **Wire into `bin/roadmap.ts`** cmdComplete: after existing completion logic, call `autoCommitCompletion(nodeId, repoRoot)`. `--no-commit` flag: skip autocommit + write non-passing receipt with reason. No env bypass. **Test** `tests/completion/auto-commit.test.ts`: 6 tests — isCompletionDirty true on modified completed.json; autoCommitCompletion triggers git add+commit; returns committed:false on clean; --no-commit writes non-passing receipt; failed commit writes non-passing receipt; post-commit isCompletionDirty false.
  - depends: rm-audit-engine
  - produces: src/lib/completion/auto-commit.ts, bin/roadmap.ts, tests/completion/auto-commit.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/completion/auto-commit.test.ts

## Phase 4: Import Gate (010)

- [P4] rm-import-audit-tail-gate: Enforce required audit terminal at import time. **`src/lib/import/audit-tail-gate.ts`**: `validateAuditTail(g:Graph<string>, contract:AuditContract)` → checks graph contains a terminal node matching `contract.requiredTerminalNodeId` or pattern `intent-metaflow-audit-*`; if missing → `{passed:false, code:'AUDIT_TERMINAL_MISSING', fix:['roadmap mf audit-tail emit --dag <id>']}`. `isAuditTailPresent(g)` → boolean. **Wire into `bin/roadmap.ts`** cmdImport: after graph build, call `validateAuditTail(g, loadRequired())`; if not passed → stderr error JSON + exit(3) with AUDIT_TERMINAL_MISSING. `--skip-audit-tail` flag writes non-passing AuditReceipt with reason instead of exiting. **Test** `tests/import/audit-tail-gate.test.ts`: 6 tests — passes on graph with matching terminal; fails AUDIT_TERMINAL_MISSING on graph without; isAuditTailPresent both cases; cmdImport exit 3 on missing (execSync integration); --skip-audit-tail writes non-passing receipt; passes with intent-metaflow-audit-required as terminal.
  - depends: rm-audit-detectors-integration
  - produces: src/lib/import/audit-tail-gate.ts, tests/import/audit-tail-gate.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/import/audit-tail-gate.test.ts

## Phase 5: CLI Audit Commands (010)

- [P5] rm-cli-mf-audit: CLI surface for audit. **`src/lib/metaflow/audit/cli.ts`**: `cmdMfAudit(runId, opts:{required?,base?})` → if --required: reads REQUIRED.json, renders table (detector code | threshold | requiredTerminalNodeId), emits JSON+RenderV1; else: calls `runAudit(runId, allDetectors, opts)`, renders AuditReport, emits JSON+render. `cmdAuditTailEmit(dagId)` → reads REQUIRED.json, produces canonical IR snippet (tasks.md fragment) for audit tail nodes: intent-metaflow-audit-required + its standard deps — a ready-to-merge IR block that can be appended to any spec. **Wire into `bin/roadmap.ts`**: `mf audit` + `mf audit-tail` cases. **Test** `tests/audit/cli.e2e.test.ts`: 8 tests — `mf audit --required` outputs REQUIRED.json fields; `mf audit --run mf-fixture-001` produces schema_version:1 AuditReport JSON; PASSED/FAILED banner in render; receipt at correct path; `mf audit-tail emit` outputs valid tasks.md fragment with intent-metaflow-audit-required; fragment parseable by import pipeline; all-pass on clean fixture run; re-run idempotent.
  - depends: rm-audit-detectors-display, rm-import-audit-tail-gate
  - produces: src/lib/metaflow/audit/cli.ts, tests/audit/cli.e2e.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/cli.e2e.test.ts

## Phase 6: Opt Map (010)

- [P6] rm-audit-opt-expansion: Map detector findings to OptimizationNodes. **`src/lib/metaflow/audit/opt-map.ts`**: `DETECTOR_TO_OPT:Record<string,{id:string;desc:string}>` for all 9 base detector codes + 5 MF codes (mapped in later phase). `buildAuditOptNodes(report:AuditReport)` → `OptimizationNode[]` for each failing detector, deduped by id. `emitAuditOptExpansion(runId, nodes, base?)` → writes `.roadmap/expansions/expand-audit-opt-<runId>.ts`. **Wire into `bin/roadmap.ts`** mf opt: also run buildAuditOptNodes if audit report exists for run. **Test** `tests/audit/opt-map.test.ts`: 6 tests — DETECTOR_TO_OPT has all 9 codes; buildAuditOptNodes maps failing RD-001 → opt-add-tables node; deduplicates; emitAuditOptExpansion writes valid TS; file imports from protocol.ts; re-emit idempotent.
  - depends: rm-cli-mf-audit
  - produces: src/lib/metaflow/audit/opt-map.ts, tests/audit/opt-map.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/opt-map.test.ts

## Phase 7: 010 Terminal

- [P7] intent-metaflow-audit-required: Terminal gate for 010 — passing audit receipt bound to treeSha+sessionIds, all detectors satisfied, display invariants met, completed.json drift prevented. Runs all 010 test suites end-to-end.
  - depends: rm-audit-opt-expansion, rm-completion-autocommit
  - produces: .roadmap/metaflow/audit/REQUIRED.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/ && npx vitest run tests/completion/ && npx vitest run tests/import/

## Phase 8: CLI Inventory (012)

- [P8] rm-cli-inventory-cmd: CLI command registry inventory. **`src/lib/cli/inventory.ts`**: `CommandEntry` type: `{ id:string, tokens:string[], description:string, flags:string[], mustHaveDisplayReceipt:boolean, exempt?:{exemptClass:'plumbing'|'internal'|'deprecated', exemptReason:string, removalPlanNode?:string}, requiredSignals:string[], examples:string[] }`. `buildInventory(argv:string[][])` → scans bin/roadmap.ts switch cases (or reads a COMMAND_MANIFEST.json if present) and builds CommandEntry[]. `validateInventory(entries)` → fails any non-exempt entry without examples[] (MISSING_EXAMPLE_VECTOR). `writeInventory(entries, base?)` → writes `.roadmap/cli/commands.json`. **`roadmap cli inventory [--write]`** command in bin/roadmap.ts: builds inventory, validates, if --write writes commands.json, emits JSON+render (table: command | receipt-required | exempt | examples-count). **Test** `tests/cli/inventory.test.ts`: 6 tests — buildInventory returns entries for known commands; non-exempt with no examples fails validation; exempt entry passes without examples; --write produces commands.json; commands.json is deterministic (second run diff-empty); requiredSignals propagated from COMMAND_REGISTRY.
  - depends: intent-metaflow-audit-required
  - produces: src/lib/cli/inventory.ts, tests/cli/inventory.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/inventory.test.ts

## Phase 9: CLI Audit Runner (012)

- [P9] rm-cli-audit-runner: Compliance audit runner with fast/full sampling. **`src/lib/cli/audit.ts`**: `ComplianceState` = 'COMPLIANT'|'EXEMPT'|'NONCOMPLIANT'. `ComplianceResult` = `{id, tokens, state, evidence:string[], failingInvariant?:string}`. `auditCommand(entry:CommandEntry, mode:'fast'|'full')` → for non-exempt: runs entry.examples[0] via execSync, checks DisplayReceipt exists + ok:true + requiredSignals present; returns ComplianceResult. For exempt: verifies machine-only JSON envelope (no display receipt needed). **`src/lib/cli/audit-samples.ts`**: `FAST_SAMPLE = ['orient','chart','mf.gantt','mf.mine','mf.audit','mf.wrap','receipts.show']` — critical command subset for fast mode. `runComplianceAudit(mode:'fast'|'full', base?)` → loads commands.json, runs auditCommand per entry (fast: FAST_SAMPLE only), returns ComplianceResult[]. **`roadmap cli audit [--sample fast|full] [--json]`** in bin/roadmap.ts. **Test** `tests/cli/audit.e2e.test.ts`: 6 tests — auditCommand COMPLIANT on well-formed receipt; NONCOMPLIANT on missing receipt; EXEMPT on exempt entry; fast mode runs only sample; full mode runs all; compliance report JSON has schema_version:1.
  - depends: rm-cli-inventory-cmd
  - produces: src/lib/cli/audit.ts, src/lib/cli/audit-samples.ts, tests/cli/audit.e2e.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/audit.e2e.test.ts

## Phase 10: Compliance Tests + Doctor (parallel, 012)

- [P10] rm-cli-compliance-tests: 100% coverage compliance test harness. **`tests/cli/compliance.e2e.test.ts`**: one test per command in inventory — for non-exempt: invokes command example, asserts DisplayReceipt exists + ok:true + requiredSignals. For exempt: asserts no DisplayReceipt written and output is valid JSON. All commands covered; any NONCOMPLIANT fails the suite. **`tests/cli/exemptions.test.ts`**: for each exempt command — asserts exemptClass is valid enum value; asserts exemptReason is non-empty; asserts machine-only JSON output (no ansi in stdout); for deprecated: asserts removalPlanNode is set. Exemption count capped at 10 (assertion); each internal/deprecated exemption must have removalPlanNode.
  - depends: rm-cli-audit-runner
  - produces: tests/cli/compliance.e2e.test.ts, tests/cli/exemptions.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/compliance.e2e.test.ts && npx vitest run tests/cli/exemptions.test.ts

- [P10] rm-doctor-cli-compliance: Human-readable compliance status. **`src/lib/cli/doctor-cli.ts`**: `renderCliCompliance(results:ComplianceResult[], opts:RenderOpts)` → string: table (command | state emoji | evidence | requiredSignals | failing invariant) + progress bar showing % compliant + PASSED/FAILED summary. `cmdDoctorCliCompliance(opts:{base?})` → runs compliance audit fast mode, renders table, emits JSON+RenderV1. **`roadmap doctor cli --compliance`** in bin/roadmap.ts. **Test** `tests/cli/doctor-cli.test.ts`: 6 tests — renderCliCompliance produces table with | separators; contains progress bar (█/░); FAILED banner when any NONCOMPLIANT; PASSED banner when all compliant; cmdDoctorCliCompliance emits JSON with schema_version:1; table includes at least one diagram when failures present.
  - depends: rm-cli-audit-runner
  - produces: src/lib/cli/doctor-cli.ts, tests/cli/doctor-cli.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/doctor-cli.test.ts

## Phase 11: Verify Invariant + CI Gate (012)

- [P11] rm-verify-cli-compliance-invariant: Wire CLI_COMPLIANCE into roadmap verify. **`src/lib/verify/invariants/cli-compliance.ts`**: `CLI_COMPLIANCE` invariant: runs `runComplianceAudit('fast')` and fails if any result.state === 'NONCOMPLIANT'. `CLI_COMPLIANCE_FULL`: same with 'full' mode. **`src/lib/verify/kernel-config.ts`**: add CLI_COMPLIANCE to default kernel invariant set. **Wire into `bin/roadmap.ts`** verify: if CLI_COMPLIANCE in invariant list, run fast compliance audit. **Test** `tests/verify/cli-compliance.test.ts`: 6 tests — CLI_COMPLIANCE passes on all-compliant audit; fails on one NONCOMPLIANT command; kernel config includes CLI_COMPLIANCE; fast mode called by default; full mode on --release flag; invariant result has code + evidence + fix[].
  - depends: rm-cli-compliance-tests, rm-doctor-cli-compliance
  - produces: src/lib/verify/invariants/cli-compliance.ts, src/lib/verify/kernel-config.ts, tests/verify/cli-compliance.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/verify/cli-compliance.test.ts

## Phase 12: 012 Terminal

- [P12] intent-cli-compliance-terminal: Terminal gate for 012 — CLI inventory is authoritative, every command is COMPLIANT or EXEMPT with tests, verify enforces CLI_COMPLIANCE, CI blocks drift.
  - depends: rm-verify-cli-compliance-invariant
  - produces: .roadmap/cli/commands.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/ && npx vitest run tests/verify/cli-compliance.test.ts

## Phase 13: MetaFlow Self-Insert (013)

- [P13] rm-metaflow-self-insert-layer: Auto wrapSubcommand injection in CLI dispatch pipeline. **`src/lib/metaflow/self-insert.ts`**: `ELIGIBLE_COMMANDS:string[]` = commands that mutate DAG state, receipts, dispatch agents, complete nodes, perform plan selection, or emit interactive human output (populate from COMMAND_REGISTRY intersected with inventory mustHaveDisplayReceipt). `readActiveRun(base?)` → reads `.roadmap/metaflow/active-run.json` or null if absent. `isEligible(tokens:string[])` → boolean check against ELIGIBLE_COMMANDS. `selfInsert(argv:string[], activeRunId:RunId, base?)` → calls wrapSubcommand({runId: activeRunId, stepId: auto-generated StepId, cmd: argv.join(' '), base}), writes `.roadmap/receipts/metaflow-self-insert-<stepId>.json` (AuditReceipt-style). **Wire into `bin/roadmap.ts`** entry point: before command dispatch, if activeRun exists AND isEligible(argv) AND no --mf-run in argv → call selfInsert(); if selfInsert throws SESSION_BINDING_MISSING → exit(3) META_FLOW_REQUIRED. **Test** `tests/metaflow/self-insert.test.ts`: 6 tests (written but the test files will be created in this node — since auto-commit doesn't exist yet, they are run after rm-completion-autocommit is wired).
  - depends: intent-cli-compliance-terminal
  - produces: src/lib/metaflow/self-insert.ts, tests/metaflow/self-insert.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/metaflow/self-insert.test.ts

## Phase 14: Active Run Lifecycle (013)

- [P14] rm-metaflow-active-run: active-run.json lifecycle and binding rules. **`src/lib/metaflow/active-run.ts`**: `ActiveRun` type: `{ schema_version:1, runId:RunId, stage:string, startedAt:string, sessionIds:string[] }`. `writeActiveRun(run:ActiveRun, base?)` → writes `.roadmap/metaflow/active-run.json`. `readActiveRun(base?)` → ActiveRun or null. `clearActiveRun(base?, opts:{requireMiningExists?:boolean, requireAuditReceipt?:boolean})` → validates mining.json + audit receipt exist (if opts set) then removes active-run.json; fails with ACTIVE_RUN_NOT_CLEARABLE if conditions unmet. **Wire into `bin/roadmap.ts`**: `mf init` → calls writeActiveRun; `mf complete` → calls clearActiveRun({requireMiningExists:true, requireAuditReceipt:true}). **Test** `tests/metaflow/active-run.test.ts`: 6 tests — writeActiveRun creates file; readActiveRun returns null if absent; clearActiveRun succeeds when mining+audit exist; fails ACTIVE_RUN_NOT_CLEARABLE without mining; fails without audit receipt; mf init writes active-run.json.
  - depends: rm-metaflow-self-insert-layer
  - produces: src/lib/metaflow/active-run.ts, tests/metaflow/active-run.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/metaflow/active-run.test.ts

## Phase 15: Surface Header (013)

- [P15] rm-metaflow-surface-header: Required MetaFlow header block in human renderer. **`src/lib/render/metaflow-header.ts`**: `renderMetaflowHeader(run:ActiveRun, stepId:StepId, treeSha:string, opts:RenderOpts)` → string: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMetaFlow Run: <runId>\nStage: <stage>\nStep: <stepId>\nTreeSha: <sha[:12]>\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`. Export from src/lib/render/index.ts. **Wire into `bin/roadmap.ts`** render path: when active-run.json present AND command is eligible (isEligible), prepend renderMetaflowHeader to stderr render output. Also write `.roadmap/receipts/metaflow-surface-<stepId>.json` with presence proof. **Test** `tests/render/metaflow-header.test.ts`: 6 tests — renderMetaflowHeader contains runId; contains StepId; contains sha[:12]; contains ━ border chars; stable across two calls with same input (deterministic); width respects opts.width.
  - depends: rm-metaflow-active-run
  - produces: src/lib/render/metaflow-header.ts, src/lib/render/index.ts, tests/render/metaflow-header.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/render/metaflow-header.test.ts

## Phase 16: MetaFlow Detectors (013)

- [P16] rm-metaflow-surface-detectors: MF-001..MF-005 detectors + PE-002. **`src/lib/metaflow/audit/detectors/metaflow.ts`**: exports `detectMetaflowCompliance(receipts, sessions, opts:{base?})` → `DetectorResult[]`. **MF-001** `detectMissingSelfInsert`: if active-run.json exists AND eligible command in receipts without matching metaflow-self-insert-*.json receipt → finding. **MF-002** `detectMissingSurfaceHeader`: for each wrapped-command receipt — check metaflow-surface-*.json exists and its render.plainPath file contains `MetaFlow Run:` AND `━` border → failing if absent. **MF-003** `detectActiveRunNotPrinted`: for mf audit/mine/wrap receipts — check plain render contains the active runId string. **MF-004** `detectStateMutationWithoutRunBinding`: IR-004 analogue — any completion/dispatch command without corresponding self-insert receipt → finding. **MF-005** `detectDisplayReceiptMissingRunId`: if DisplayReceipt (receipt with --mf-run context) omits runId field → finding. **PE-002** `detectProcessEscapePostSelfInsert`: eligible command invoked without wrap when authority present AND no self-insert receipt emitted → fail closed. **Test** `tests/audit/metaflow-detectors.test.ts`: 8 tests — MF-001 fires on missing self-insert; MF-002 fires on missing header; MF-003 fires on missing runId in render; MF-004 fires on state mutation without binding; PE-002 fires on unwrapped eligible command; all pass on properly wrapped fixture; detectMetaflowCompliance returns 6 results on fixture; updateDAETECTOR_TO_OPT includes all MF codes.
  - depends: rm-metaflow-surface-header
  - produces: src/lib/metaflow/audit/detectors/metaflow.ts, tests/audit/metaflow-detectors.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/audit/metaflow-detectors.test.ts

## Phase 17: CLI Audit MetaFlow Extension (013)

- [P17] rm-cli-audit-metaflow: Extend cli audit to include MetaFlow compliance. **`src/lib/cli/audit-metaflow.ts`**: `auditMetaflowCompliance(entries:CommandEntry[], base?)` → for each eligible non-exempt command: checks self-insert receipt exists, surface header present, runId in render; returns `MetaflowComplianceResult[]` with state COMPLIANT|NONCOMPLIANT|EXEMPT. **`roadmap cli audit --metaflow`** in bin/roadmap.ts: runs both compliance audit + metaflow compliance audit, renders combined table (command | receipt-state | metaflow-state | self-insert | header). **Test** `tests/cli/metaflow-audit.test.ts`: 6 tests — auditMetaflowCompliance COMPLIANT on command with all receipts; NONCOMPLIANT on missing self-insert; NONCOMPLIANT on missing header; cli audit --metaflow renders combined table; zero noncompliant on fixture; table contains ━ border chars.
  - depends: rm-metaflow-surface-detectors
  - produces: src/lib/cli/audit-metaflow.ts, tests/cli/metaflow-audit.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/cli/metaflow-audit.test.ts

## Phase 18: 013 Terminal

- [P18] intent-metaflow-self-inserting-sovereign: Terminal intent — if authority present, eligible commands are auto-wrapped, surfaced with MetaFlow header, MF-001..MF-005 + PE-002 detectors satisfied, cli audit --metaflow zero noncompliant. No command can mutate DAG state outside MetaFlow when active.
  - depends: rm-cli-audit-metaflow
  - produces: .roadmap/metaflow/active-run.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/metaflow/ && npx vitest run tests/audit/ && npx vitest run tests/cli/metaflow-audit.test.ts && npx vitest run tests/render/metaflow-header.test.ts
