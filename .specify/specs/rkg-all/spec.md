# Feature Specification: RKG-1 + RKG-2 — Governance Kernel Hardening + Federated Attestation

**Feature Branch**: `rkg-all`
**Created**: 2026-02-28
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Plan-Selection Gate (Priority: P1)

No mutation (complete, expand, import, branch, retire) may occur unless a valid `plan-select` receipt exists for the current `headSha`. Enforcement is hard: `roadmap verify` returns `PLAN_NOT_SELECTED` if missing.

**Why this priority**: Foundation for all governance hardening. Every other feature assumes plans are explicitly chosen before work begins.

**Independent Test**: `roadmap plan select <id> --note "..."` writes a receipt; `roadmap plan status` shows selected; subsequent `roadmap verify` passes plan-selection invariant.

**Acceptance Scenarios**:

1. **Given** no plan-select receipt exists, **When** `roadmap verify` runs, **Then** output contains `violations[]` with code `PLAN_NOT_SELECTED` and exit code 1.
2. **Given** a valid plan-select receipt exists for current `headSha`, **When** head.json mutates (expand/import), **Then** `roadmap verify` emits `PLAN_INVALIDATED` — selection is stale.
3. **Given** `roadmap plan select <id> --note "..."` runs, **Then** `.roadmap/receipts/plan-select-<sha>.json` exists with `headSha`, `candidateId`, `timestamp`, `note`.
4. **Given** `roadmap plan status` runs, **Then** output shows current selection (or `unselected`) with sha and age.

---

### User Story 2 — Spec-Origin Gate (Priority: P1)

Any DAG imported from spec-kit carries provenance. Direct edits to `head.json` fail verify when `spec-origin.json` exists.

**Why this priority**: Protects spec-compiled DAGs from silent drift. Pairs with FR-SPEC-003.

**Independent Test**: Import a DAG with `--spec-compiled`. Attempt direct `head.json` mutation. `roadmap verify` emits `SPEC_ORIGIN_VIOLATED`.

**Acceptance Scenarios**:

1. **Given** `.roadmap/spec-origin.json` exists, **When** `head.json` is edited directly (not via `roadmap import --spec-compiled`), **Then** `roadmap verify` emits `SPEC_ORIGIN_VIOLATED`.
2. **Given** `roadmap import --spec-compiled <path>` runs, **Then** `.roadmap/receipts/spec-import-<sha>.json` is written with `engine`, `version`, `compile_hash`, `spec_sha`.
3. **Given** spec-origin exists and `compile_hash` in receipt matches current, **Then** `roadmap verify` passes spec-origin check.

---

### User Story 3 — Roadmap Verify (CI-Ready Kernel) (Priority: P1)

Single deterministic entrypoint for local CI attestation. `roadmap verify` checks all invariants and exits with structured JSON output.

**Why this priority**: CI integration point. Everything else feeds into this command.

**Independent Test**: Running `roadmap verify` produces JSON with `violations[]`, `warnings[]`, `fix[]`. Exit 0 on clean, 1 on user-actionable violations, 2 on internal invariant failure.

**Acceptance Scenarios**:

1. **Given** a clean governance state, **When** `roadmap verify` runs, **Then** stdout JSON has `violations: []`, `warnings: []`, exit code 0.
2. **Given** any of: missing plan-select receipt, stale plan, spec-origin violated, orphan receipts, env-var bypass detected, **When** `roadmap verify` runs, **Then** corresponding violation code appears in `violations[]`.
3. **Given** `roadmap verify` finds an env-var governance bypass (scan), **Then** violation code `ENV_BYPASS_DETECTED` with path to file.
4. **Given** orphan receipts exist (no corresponding node in DAG), **Then** violation code `ORPHAN_RECEIPT` with receipt paths.
5. **Given** CompletionStore is inconsistent (node marked done but artifacts missing), **Then** violation code `COMPLETION_INCONSISTENCY`.

---

### User Story 4 — Commit Intake Compiler (Priority: P2)

Absorb free commits from colleagues into Roadmap governance without forcing them to use Roadmap.

**Why this priority**: Enables team collaboration. Unblocked colleagues can commit freely; Roadmap absorbs their work.

**Independent Test**: `roadmap intake scan` after a colleague commit shows changed paths grouped into candidate nodes. `roadmap intake import` ingests them. `roadmap intake certify` writes receipts.

**Acceptance Scenarios**:

1. **Given** git diff against last attested commit contains changed paths, **When** `roadmap intake scan` runs, **Then** JSON output groups paths into candidate NodeSpecs with proposed ids, descriptions, produces.
2. **Given** `roadmap intake scan` output, **When** `roadmap intake import` runs, **Then** candidate nodes are added to DAG with `intakeFrom` provenance.
3. **Given** imported intake nodes, **When** `roadmap intake certify` runs, **Then** nodes are completed with receipts via normal CompletionStore path.

---

### User Story 5 — Plan Overlay (Priority: P2)

Join gallery execution plans with concrete DAGs without replacing head. Schedule binds to current `headSha`.

**Why this priority**: Unifies gallery strategy with real tasks. Required for multi-agent dispatch.

**Independent Test**: `roadmap plan overlay --select <id>` writes `.roadmap/plan-overlay.json`. `roadmap plan schedule` shows ordered clusters. Overlay invalidates on DAG mutation.

**Acceptance Scenarios**:

1. **Given** a valid plan-select receipt, **When** `roadmap plan overlay --select <id>` runs, **Then** `.roadmap/plan-overlay.json` written with `headSha`, `candidateId`, `clusters[]`, `schedule[]`.
2. **Given** a plan-overlay.json exists and head.json mutates, **When** `roadmap plan schedule` runs, **Then** output contains `OVERLAY_STALE` warning.
3. **Given** valid overlay, **When** `roadmap plan schedule` runs, **Then** JSON shows deterministic schedule derived from overlay clusters + DAG topology.

---

### User Story 6 — State Introspection (Priority: P2)

Eliminate ambiguity between head-only state and CompletionStore state. Explicit counts always derivable.

**Why this priority**: Fixes the "0% vs 98% done" confusion. Foundational UX invariant.

**Independent Test**: `roadmap status --json` returns `{ total, done, pending, failed, skipped, planned }` derived from CompletionStore. `roadmap doctor` surfaces any inconsistency.

**Acceptance Scenarios**:

1. **Given** any DAG state, **When** `roadmap status --json` runs, **Then** output contains `total`, `done`, `pending`, `failed`, `skipped`, `planned` counts derived from CompletionStore (not head.json).
2. **Given** `roadmap remaining --json` runs, **Then** output lists nodes not yet completed with their produces and blocking deps.
3. **Given** any inconsistency (completion recorded but artifact missing), **When** `roadmap doctor` runs, **Then** output lists each inconsistency with fix suggestion.

---

### User Story 7 — Attestation Emission (Priority: P3)

Roadmap emits a CI-grade check report consumable by local CI attestation signer.

**Why this priority**: Enables Donjon/CI integration. Roadmap becomes an attestation source.

**Independent Test**: `roadmap check --id roadmap.verify` outputs JSON with `checkId`, `commitSha`, `treeSha`, `violations[]`, `artifacts[]`.

**Acceptance Scenarios**:

1. **Given** `roadmap check --id roadmap.verify` runs, **Then** JSON output contains `checkId`, `commitSha`, `treeSha`, `violations[]`, `artifacts[]`.
2. **Given** a clean verify state, **When** `roadmap check --id roadmap.verify` runs, **Then** `violations: []` and exit 0.
3. **Given** violations exist, **Then** each violation carries `code`, `message`, `paths?`, `nodeIds?`, `fix[]`.

---

### User Story 8 — Receipt Evidence (Priority: P3)

Completion receipts carry structured validator outputs. Evidence is not "pass by timestamp."

**Why this priority**: Makes audit trail meaningful. Receipts without validator evidence are untrustworthy.

**Independent Test**: After `roadmap complete <node>`, receipt contains `validatorResults[]` with `id`, `passed`, `exitCode`, `artifactPaths[]`, `runner`, `commitSha`, `treeSha`.

**Acceptance Scenarios**:

1. **Given** `roadmap complete <node>` succeeds, **Then** receipt at `.roadmap/receipts/<node>-<sha>.json` contains `validatorResults[]` with per-validator `id`, `passed`, `exitCode`.
2. **Given** a validator produces stdout/stderr, **Then** those are captured to `.roadmap/artifacts/<nodeId>/<sha>/` and referenced in receipt by sha256.
3. **Given** receipt exists with `treeSha`, **When** `roadmap verify` checks completion, **Then** node is "done" iff receipt `treeSha` matches current tree (or portability scope is documented).

---

### User Story 9 — Deterministic Validator Harness (Priority: P3)

Validators run under a predictable harness: normalized env, cwd, captured output.

**Why this priority**: Makes validator results comparable and reproducible. Prerequisite for receipt evidence.

**Independent Test**: `src/lib/validator-runner.ts` normalizes env to allowlist, captures stdout/stderr, computes sha256s, returns structured result.

**Acceptance Scenarios**:

1. **Given** a shell validator, **When** validator-runner executes it, **Then** env is normalized to allowlist (no ambient HOME, PATH injection), cwd is repo root.
2. **Given** validator produces output, **Then** stdout and stderr are captured to temp files, sha256 computed, result struct returned.
3. **Given** existing ad-hoc `spawnSync` validator calls, **When** refactored through validator-runner, **Then** test coverage passes identically.

---

### User Story 10 — Multi-Repo Graph Merge (Priority: P3)

Import multiple DAGs into one federation view without mutating originals.

**Why this priority**: "Merge memories and roadmaps" made mechanical. Required for cross-repo orchestration.

**Independent Test**: `roadmap federation add --path <repo>` adds peer. `roadmap federation build` produces stable composite graph. `roadmap federation status` shows blockers across repos.

**Acceptance Scenarios**:

1. **Given** `roadmap federation add --path <repo>` runs, **Then** `.roadmap/federation/peers.json` updated with peer root.
2. **Given** `roadmap federation build` runs, **Then** `.roadmap/federation/view.json` contains composite graph with node IDs namespaced as `<peerId>::<nodeId>`.
3. **Given** view.json exists, **When** `roadmap federation status` runs, **Then** JSON shows per-peer completion state and cross-repo blockers.

---

### User Story 11 — Cross-Repo Dependency Edges (Priority: P4)

NodeSpec `depends[]` may include `peer::<repoId>::<nodeId>`. `roadmap verify` enforces cross-repo dep satisfaction.

**Why this priority**: True organizational orchestration. Enables "model and orchestrate the org."

**Independent Test**: A node with `depends: ["peer::other-repo::node-x"]` blocks completion until peer CompletionStore shows node-x done.

**Acceptance Scenarios**:

1. **Given** a node with `depends: ["peer::other-repo::node-x"]`, **When** `roadmap verify` runs, **Then** failure if peer's node-x not in CompletionStore.
2. **Given** peer node completed, **When** `roadmap verify` runs, **Then** cross-repo dep satisfied.
3. **Given** dep points to unknown peer, **Then** `roadmap verify` emits `UNKNOWN_PEER` violation.

---

### User Story 12 — Deterministic Dispatch Plan Artifacts (Priority: P4)

Dispatch plans are first-class artifacts. Agents don't invent background tasks.

**Why this priority**: Makes swarm coordination reproducible. Closes the "hallucinated fanout" failure mode.

**Independent Test**: `roadmap dispatch plan` writes `.roadmap/dispatch/plan-<sha>.json`. `roadmap dispatch apply` writes receipt. `roadmap dispatch status` shows current plan state.

**Acceptance Scenarios**:

1. **Given** `roadmap dispatch plan [--overlay <id>] [--workers N]` runs, **Then** `.roadmap/dispatch/plan-<sha>.json` written with `headSha`, `overlayId`, `clusters`, `worktrees`, `ownership`.
2. **Given** `roadmap dispatch apply` runs, **Then** `.roadmap/dispatch/receipts/dispatch-<sha>.json` written (does not spawn agents).
3. **Given** `roadmap dispatch status` runs, **Then** JSON shows current dispatch plan, assignments, completion state.

---

### User Story 13 — Explain + Receipts + Artifacts CLI (Priority: P4)

Make it trivial to answer "why does it say 0%?" or "which receipt is missing?"

**Why this priority**: Agent friction killer. Reduces debug cycle from minutes to seconds.

**Independent Test**: `roadmap explain --node X` returns producing existence, receipt presence, failing validator, last run, fixes. `roadmap receipts ls` and `roadmap artifacts ls` work.

**Acceptance Scenarios**:

1. **Given** `roadmap explain --node <id>` runs, **Then** JSON output contains: produces existence (exists/missing per file), receipt presence, failing validator (if any), last run timestamp, fix suggestions.
2. **Given** `roadmap receipts ls [--node <id>]` runs, **Then** JSON lists receipts with node, sha, timestamp, passed.
3. **Given** `roadmap artifacts ls [--node <id>]` runs, **Then** JSON lists captured artifact files with path, sha256, size.

---

### User Story 14 — Govern Roadmap's Own Evolution (Priority: P5)

Roadmap uses its own verify + contract tests + env-audit to prevent regression.

**Why this priority**: Dogfooding closes the loop. Roadmap can't be trusted if it doesn't govern itself.

**Independent Test**: `.roadmap/kernel.json` prohibits disabling gates without signed override receipt. CI-required checks: `roadmap verify`, `roadmap contract test`, `roadmap env-audit`.

**Acceptance Scenarios**:

1. **Given** `.roadmap/kernel.json` exists, **When** any gate-disable attempt is made without signed override receipt, **Then** `roadmap verify` emits `KERNEL_GATE_DISABLED` violation.
2. **Given** `roadmap contract test` runs, **Then** JSON envelope, error codes, stderr discipline checked against schema.
3. **Given** `roadmap env-audit` runs, **Then** all source files scanned for `process.env` governance bypasses; violations reported with file + line.
