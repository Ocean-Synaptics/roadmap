---
description: "RKG-3/4/5/6 — governance hardening: parallelism/hallucination strategy, engine semantics, gallery/blend, intent guards"
dagId: rkg-governess
---

# Tasks: RKG-3/4/5/6 — Governance Hardening

**Input**: RKG-3 (Parallelism + Hallucination Strategy), RKG-4 (Engine Semantics Hardening), RKG-5 (Gallery + Blend Governance), RKG-6 (Intent Guard System)
**Prerequisites**: existing codebase — src/protocol.ts, src/lib/, bin/roadmap.ts

## Phase 0: Init

- [P0] init: Existing roadmap codebase — src/protocol.ts, src/lib/, bin/roadmap.ts, validator-runner, completion-store, intent-expansion, blend, emit-gallery, intent-evaluator
  - produces: src/protocol.ts, src/lib/validator-runner.ts, src/lib/completion-store.ts

## Phase 1: Branch Foundations (all parallel)

- [P1] rkg3-validator-argv: FR-IR-001 — shell validators as argv arrays instead of string commands. Replace string-based shell validator with argv array type in ValidationRule. Update NodeSpec shell validators, validator-runner to accept string[]. Prevents shell injection. Adds shebang-free argv contract.
  - depends: init
  - produces: src/lib/validator-argv.ts, src/protocol.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg4-kernel-config: kernel.json schema + loader — centralized kernel configuration for algorithm policy, batch conflict policy, orient plan receipts, merge/branch witness, env clamping policy. Write KernelConfig type and loadKernel() loader that reads .roadmap/kernel.json with defaults fallback.
  - depends: init
  - produces: src/lib/kernel-config.ts, .roadmap/kernel.json
  - validate: shell:npx tsc --noEmit

- [P1] rkg5-blend-receipt: FR-GB-001 — BlendReceipt schema + ledger. Every blend() call writes a structured BlendReceipt (blendId, timestamp, inputs[], outputId, guardResults[], statementOwnership[], checkSet). Add ledger writer that appends to .roadmap/blend-ledger.jsonl.
  - depends: init
  - produces: src/lib/blend.ts, src/lib/blend-receipt.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg6-judgment-receipt: FR-IG-001 — IntentJudgmentReceipt schema + writer. Every intent evaluation writes a structured receipt (evaluationId, timestamp, nodeId, judgment, confidence, evidence[], diagnosisBlocks[]). Writer appends to .roadmap/intent-judgments.jsonl.
  - depends: init
  - produces: src/lib/intent-evaluator.ts, src/lib/judgment-receipt.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: Implementation (parallel within branch constraints)

### RKG-3 Implementation

- [P2] rkg3-git-index: FR-PAR-001 — per-worker git index isolation. Add GIT_INDEX_FILE env binding in swarm dispatch so each worker gets an isolated index file (.roadmap/idx/<workerId>.idx). Prevents index races when workers git add concurrently. Expose indexPath in dispatch receipt.
  - depends: rkg3-validator-argv
  - produces: src/lib/git-index.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg3-hook-scoping: FR-PAR-002 — hook scoping staged-only. Pre-commit hook must validate only staged files (git diff --cached), not working tree. Update hook runner to pass --staged flag and document contract. Prevents false positives on in-progress worker files.
  - depends: rkg3-validator-argv
  - produces: src/lib/hook-scope.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg3-strategy-ab: FR-HAL-001 — strategy A/B overlays. Add StrategyOverlay type and applyOverlay() function. Overlays define hypothesis variants (model params, prompt templates, validator thresholds) that can be layered on a base plan. Write overlay to .roadmap/strategy-overlay.json.
  - depends: rkg3-validator-argv
  - produces: src/lib/strategy-overlay.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg3-perf-cache: FR-PERF-001 — verify cache keyed by treeSha. Add VerifyCache that stores validation results keyed by (nodeId, treeSha). Cache hit skips re-running shell validators. Write cache to .roadmap/verify-cache.json. Invalidate on treeSha change.
  - depends: rkg3-validator-argv
  - produces: src/lib/verify-cache.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg3-dispatch-enforcement: FR-DISP-002 — dispatch plan as enforcement object. DispatchReceipt records: batchId, agentAssignments[], timestamp, orientSha. Complete rejects if dispatch receipt missing or stale (orientSha mismatch). Write receipt to .roadmap/receipts/dispatch-<batchId>.json.
  - depends: rkg3-strategy-ab
  - produces: src/lib/dispatch-receipt.ts
  - validate: shell:npx tsc --noEmit

### RKG-4 Implementation

- [P2] rkg4-stable-order: FR-DET-001 — deterministic comparator policy in parallelOrder/order. Add ComparatorPolicy type. Default: lexicographic by node id. Custom: user-supplied compare(a,b) in kernel.json. parallelOrder() and order() read policy from kernel config. Output is stable across runs.
  - depends: rkg4-kernel-config
  - produces: src/protocol.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-reachability: FR-REACH-001 — single-pass BFS reachability. Replace multi-pass DFS with single BFS from init in check(). BFS enumerates all reachable nodes in one pass. Unreachable nodes emitted as violations. Add reachability witness (path from init to each node) in output.
  - depends: rkg4-kernel-config
  - produces: src/lib/verify.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-contract-closure: FR-CONTRACT-001 — DP ancestor closure + witness. verify() uses bottom-up DP to compute ancestor closure for each node. Missing consumes emit violation with witness path showing which ancestor was supposed to produce it. Replaces ad-hoc predecessor walk.
  - depends: rkg4-kernel-config
  - produces: src/lib/verify.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-batch-gate: FR-BATCH-001 — conflict detection as hard gate. validateBatch() detects when two nodes in the same batch both write the same produces path. Gate rejects batch before execution. Conflict report names both nodes and the contested path.
  - depends: rkg4-kernel-config
  - produces: src/lib/batch-conflicts.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-orient-plan-receipt: FR-ORIENT-001 — plan expansion receipt in orient output. When orient() encounters a plan node in current batch, emit planReceipt field: {nodeId, mode:'plan', preGateActive, expandedChildren[]}. Allows orchestrators to distinguish plan vs execute positions.
  - depends: rkg4-kernel-config
  - produces: src/protocol.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-merge-branch-witness: FR-MERGE-001 + FR-BRANCH-001 — namespace collision detection + witness in merge/branch. merge() detects node id collisions (same id in both graphs) and emits MergeConflict with both node specs. branch() emits BranchWitness recording which nodes were included and why (reachable from fromNode).
  - depends: rkg4-kernel-config
  - produces: src/protocol.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-env-bypass: FR-STACK-001 — env clamping in validator runner. Validator-runner allowlist (ALLOWED_ENV) controlled by kernel.json envPolicy section. Unknown env vars stripped before child process spawn. ROADMAP_VALIDATING always injected. Bypass vars (SKIP_BATCH_COMMIT etc.) require explicit kernel allowlist entry.
  - depends: rkg4-kernel-config
  - produces: src/lib/validator-runner.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg4-algo-report: FR-DOC-ALG-001 — `roadmap report algorithms` command. Emits structured JSON listing all algorithms used (BFS/DFS/DP/topo), their complexity, input/output contracts, and which source file implements them. Reads @algorithm JSDoc annotations from src/ files.
  - depends: rkg4-stable-order, rkg4-reachability
  - produces: src/lib/algo-report.ts
  - validate: shell:npx tsc --noEmit

### RKG-5 Implementation

- [P2] rkg5-guard-policy: FR-GB-002 — guard registry + blendPolicy config. GuardRegistry maps guard names to GuardFn<T>. blendPolicy in kernel.json lists active guards and their parameters. blend() reads policy and runs registered guards in order. Missing guard name = hard error.
  - depends: rkg5-blend-receipt
  - produces: src/lib/blend-policy.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg5-statement-ownership: FR-GB-003 — StatementOwnership model. Every statement produced by blend() carries an ownerNodeId and provenance chain (source → transform → output). blend() writes ownership records into BlendReceipt. Orphan statements (no ownerNodeId) are rejected.
  - depends: rkg5-blend-receipt
  - produces: src/lib/blend.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg5-checkset: FR-GB-004 — CheckSet type + rollback evidence. CheckSet is an ordered list of validation checks with pass/fail/skip states and rollback evidence per check. blend() attaches a CheckSet to each BlendReceipt. Failed check triggers rollback with evidence written to .roadmap/blend-rollbacks/.
  - depends: rkg5-blend-receipt
  - produces: src/lib/blend.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg5-candidate-receipts: FR-GB-005 — CandidateResult provenance. Every candidate emitted by emit-gallery carries a CandidateReceipt (candidateId, sourceNodeId, producedAt, pipelineSteps[]). emit-gallery writes receipts to .roadmap/receipts/candidate-<id>.json.
  - depends: rkg5-blend-receipt
  - produces: src/lib/emit-gallery.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg5-pareto-governance: FR-GB-006 — quantization + pareto report. gallery() computes pareto front across candidate metrics (coverage, cost, latency). Quantization bins metrics to prevent noise-driven rank changes. Emit pareto report to .roadmap/artifacts/pareto-<sha>.json.
  - depends: rkg5-blend-receipt
  - produces: src/lib/gallery.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg5-failure-routing: FR-GB-007 — GalleryFailure routing contract. emit-gallery returns typed GalleryFailure on rejection (insufficientCandidates, guardRejection, paretoEmpty). Caller must handle each case explicitly. No silent empty returns. Failure carries evidence (which guard, which check, which candidates evaluated).
  - depends: rkg5-candidate-receipts
  - produces: src/lib/emit-gallery.ts
  - validate: shell:npx tsc --noEmit

### RKG-6 Implementation

- [P2] rkg6-structured-diagnosis: FR-IG-002 — structured diagnosis schema. IntentDiagnosis replaces free-text failure messages. Schema: {code, affectedNode, evidenceIds[], remediationSteps[]}. intent-expansion.ts writes structured diagnosis instead of string messages. No keyword matching in diagnosis — pure structural.
  - depends: rkg6-judgment-receipt
  - produces: src/lib/intent-expansion.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg6-intent-status-policy: FR-IG-003 — intentPolicy gating in kernel.json. kernel.json intentPolicy section: {minConfidence, escalateOnStall, maxRecursionDepth}. orient() reads policy and gates advancement when intent judgment below minConfidence. Expose intentPolicyActive in Orientation output.
  - depends: rkg6-judgment-receipt
  - produces: src/protocol.ts, src/lib/kernel-config.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg6-evidence-algebra: FR-IG-004 — evidence mode field + confirmation semantics. EvidenceItem gains mode field: 'observation' | 'assertion' | 'counter'. Confirmation requires ≥1 observation + ≥1 assertion, zero counter-evidence. expand() validates evidence algebra before committing expansion.
  - depends: rkg6-judgment-receipt
  - produces: src/lib/intent-expansion.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg6-expansion-receipt: FR-IG-005 — ExpansionReceipt + sibling invariants. Every expand() call writes ExpansionReceipt (expansionId, parentNodeId, childNodeIds[], siblingInvariants[], timestamp). Sibling invariant: no two siblings produce the same path. Violation rejects expansion.
  - depends: rkg6-judgment-receipt
  - produces: src/lib/intent-expansion.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg6-convergence-metrics: FR-IG-006 — convergence history receipt + window stall detection. ConvergenceHistory tracks (recursionLevel, coverageDelta, expandedCount) per iteration. Stall = coverageDelta < threshold for N consecutive iterations. Stall triggers escalation. Write history to .roadmap/convergence-history.jsonl.
  - depends: rkg6-judgment-receipt
  - produces: src/lib/intent-expansion.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg6-rate-card: FR-IG-007 — rates.json schema + rateCardHash. rates.json defines cost-per-token rates for each model. RateCard loader reads rates.json, computes rateCardHash (sha256 of content). Cost estimates in convergence metrics reference rateCardHash for auditability.
  - depends: rkg6-judgment-receipt
  - produces: src/lib/rate-card.ts, .roadmap/rates.json
  - validate: shell:npx tsc --noEmit

## Phase 3: Fixture Suites + CLI (parallel)

- [P3] rkg3-fixtures: Fixture suite for RKG-3. Tests: argv validator roundtrip (no shell injection), git index isolation (two workers, no index collision), hook scoping (staged-only validation), strategy overlay application, dispatch receipt gating (reject on stale orientSha), verify cache hit/miss by treeSha.
  - depends: rkg3-git-index, rkg3-hook-scoping, rkg3-strategy-ab, rkg3-dispatch-enforcement, rkg3-perf-cache
  - produces: tests/rkg3.test.ts
  - validate: shell:npx vitest run tests/rkg3.test.ts

- [P3] rkg4-fixtures: Fixture DAGs + expected outputs for RKG-4. Tests: parallelOrder stability across runs (same DAG → same order), BFS reachability witness (path from init to each node), contract closure violations with ancestor witness, batch conflict detection (two nodes same produces path), plan receipt in orient output.
  - depends: rkg4-stable-order, rkg4-reachability, rkg4-contract-closure, rkg4-batch-gate, rkg4-orient-plan-receipt
  - produces: tests/rkg4.test.ts
  - validate: shell:npx vitest run tests/rkg4.test.ts

- [P3] rkg5-fixtures: Adversarial fixture suite for RKG-5. Tests: guard registry (unknown guard = hard error), orphan statement rejection, CheckSet rollback evidence written on failure, candidate receipt written per candidate, pareto front stable under noise quantization, GalleryFailure routing (each failure type carries evidence).
  - depends: rkg5-guard-policy, rkg5-statement-ownership, rkg5-checkset, rkg5-pareto-governance, rkg5-failure-routing
  - produces: tests/rkg5.test.ts
  - validate: shell:npx vitest run tests/rkg5.test.ts

- [P3] rkg5-cli-explain: FR-GB-009 — `roadmap gallery explain` + `roadmap blend explain` commands. gallery explain <candidateId>: reads candidate receipt, outputs provenance chain. blend explain <blendId>: reads blend ledger entry, outputs guard results + statement ownership + check set. Add both commands to bin/roadmap.ts.
  - depends: rkg5-blend-receipt
  - produces: bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P3] rkg6-fixtures: Intent guard fixture suite for RKG-6. Tests: structured diagnosis (no string keyword matching), intentPolicy minConfidence gate (reject orient advancement below threshold), evidence algebra validation (counter-evidence blocks confirmation), sibling invariant enforcement (same produces path → rejection), convergence stall escalation.
  - depends: rkg6-structured-diagnosis, rkg6-intent-status-policy, rkg6-evidence-algebra, rkg6-expansion-receipt, rkg6-convergence-metrics
  - produces: tests/rkg6.test.ts
  - validate: shell:npx vitest run tests/rkg6.test.ts

## Phase 4: Terminal

- [P4] term: All RKG-3/4/5/6 governance hardening complete. All fixture suites pass. TypeScript clean. Full test suite green.
  - depends: rkg3-fixtures, rkg4-fixtures, rkg5-fixtures, rkg5-cli-explain, rkg6-fixtures, rkg4-merge-branch-witness, rkg4-env-bypass, rkg4-algo-report, rkg3-dispatch-enforcement, rkg6-rate-card
  - produces: tests/rkg3.test.ts, tests/rkg4.test.ts, tests/rkg5.test.ts, tests/rkg6.test.ts
  - validate: shell:npx tsc --noEmit
  - validate: shell:npx vitest run
