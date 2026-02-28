---
description: "RKG-1 + RKG-2: Governance Kernel Hardening + Federated Governance + Attestation"
dagId: rkg-all
---

# Tasks: RKG — Governance Kernel Hardening + Federated Attestation

**Input**: .specify/specs/rkg-all/spec.md
**Prerequisites**: spec.md

## Phase 0: Init (existing codebase)

- [P0] init: Existing roadmap codebase — bin/roadmap.ts, src/lib/, src/protocol.ts, CompletionStore, ValidationRule
  - produces: bin/roadmap.ts, src/protocol.ts, src/lib/completion-store.ts

## Phase 1: Types + Foundation (parallel)

- [P1] plan-selection-types: Define plan-select receipt schema, PLAN_SELECTED pointer type, and selector types in src/lib/plan-selection.ts. Receipt fields: headSha, candidateId, timestamp, note. Write type guards and schema constants.
  - depends: init
  - produces: src/lib/plan-selection.ts
  - validate: shell:npx tsc --noEmit

- [P1] completion-store-ext: Extend CompletionStore receipt record with validatorResults[], runner, commitSha, treeSha. Extend CompletionRecord type in src/lib/completion-store.ts without breaking existing reads.
  - depends: init
  - produces: src/lib/completion-store.ts
  - validate: shell:npx tsc --noEmit

- [P1] spec-origin-schema: Define spec-origin.json schema (engine, version, compile_hash, spec_sha) and spec-import receipt type in src/lib/spec-origin.ts. Add spec-origin check predicate.
  - depends: init
  - produces: src/lib/spec-origin.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: CLI Gates + Validator Harness (parallel)

- [P2] plan-select-cmd: Add CLI commands: `roadmap plan select <candidateId> --note`, `roadmap plan status`. Writes plan-select receipt to .roadmap/receipts/plan-select-<sha>.json and .roadmap/PLAN_SELECTED.json pointer.
  - depends: plan-selection-types
  - produces: bin/roadmap.ts, src/lib/plan-selection.ts
  - validate: shell:npx tsc --noEmit

- [P2] spec-origin-gate: Add `roadmap import --spec-compiled` path to write spec-origin.json and spec-import receipt. Block direct head.json edits when spec-origin.json exists via verify rule predicate.
  - depends: spec-origin-schema
  - produces: src/lib/spec-origin.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] validator-runner: Implement src/lib/validator-runner.ts — normalized env allowlist, cwd normalization, stdout/stderr capture to .roadmap/artifacts/<nodeId>/<sha>/, sha256 computation, structured ValidatorResult type. Replace ad-hoc spawnSync calls.
  - depends: completion-store-ext
  - produces: src/lib/validator-runner.ts
  - validate: shell:npx tsc --noEmit

- [P2] verify-skeleton: Scaffold `roadmap verify` command with JSON envelope output (violations[], warnings[], fix[]) and exit code protocol (0/1/2). Wire in: DAG structural validity, CompletionStore consistency checks.
  - depends: plan-selection-types, spec-origin-schema
  - produces: src/lib/verify.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

## Phase 3: Verify Kernel Integration

- [P3] verify-kernel: Wire all invariant checks into verify-skeleton: plan-selection receipt valid, spec-origin integrity, orphan receipt detection, env-var bypass scan (grep process.env in src/), CompletionStore consistency, no artifact-only completion. Each violation carries code + message + paths? + fix[].
  - depends: plan-select-cmd, spec-origin-gate, verify-skeleton, validator-runner
  - produces: src/lib/verify.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

## Phase 4: Feature Commands (parallel)

- [P4] intake-compiler: Implement `roadmap intake scan`, `roadmap intake import`, `roadmap intake certify`. Scan diffs git log against last attested commit; group changed paths into candidate NodeSpecs; import with intakeFrom provenance; certify via CompletionStore.
  - depends: verify-kernel
  - produces: src/lib/intake.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P4] plan-overlay: Implement `roadmap plan overlay --select <id>`, `roadmap plan schedule`. Write .roadmap/plan-overlay.json with headSha, candidateId, clusters[], schedule[]. Overlay invalidates on DAG mutation. Schedule is deterministic from overlay clusters + DAG topology.
  - depends: verify-kernel, plan-select-cmd
  - produces: src/lib/plan-overlay.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P4] state-introspection: Add `roadmap status --json`, `roadmap remaining --json`, `roadmap doctor`. Derive counts (total, done, pending, failed, skipped, planned) from CompletionStore only. Doctor surfaces inconsistencies with fix suggestions.
  - depends: verify-kernel
  - produces: bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P4] receipt-evidence: Wire validator-runner into complete flow. After complete, write validator artifact files under .roadmap/artifacts/<nodeId>/<sha>/. Receipt references artifacts by sha. treeSha bound on record.
  - depends: validator-runner, completion-store-ext, verify-kernel
  - produces: src/lib/completion-store.ts, src/lib/validator-runner.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

## Phase 5: Attestation + Federation (parallel)

- [P5] attestation-emit: Add `roadmap check --id roadmap.verify` — synonym for verify with explicit checkId. Output: checkId, commitSha, treeSha, violations[], artifacts[]. Bind to treeSha not commitSha when possible.
  - depends: verify-kernel, receipt-evidence
  - produces: src/lib/verify.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P5] multi-repo-merge: Implement `roadmap federation add --path <repo>`, `roadmap federation build`, `roadmap federation status`. Write .roadmap/federation/peers.json (peer list). Build computes .roadmap/federation/view.json with namespaced node IDs <peerId>::<nodeId>. View is read-only + deterministic.
  - depends: verify-kernel
  - produces: src/lib/federation.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P5] dispatch-plan: Implement `roadmap dispatch plan [--overlay] [--workers N]`, `roadmap dispatch apply`, `roadmap dispatch status`. Plan writes .roadmap/dispatch/plan-<sha>.json (headSha, overlayId, clusters, worktrees, ownership). Apply writes receipt. Does not spawn agents.
  - depends: plan-overlay
  - produces: src/lib/dispatch.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

## Phase 6: Cross-Repo Deps + Ergonomics (parallel)

- [P6] cross-repo-deps: Extend NodeSpec.depends[] to accept `peer::<repoId>::<nodeId>` strings. verify-kernel checks cross-repo deps by reading peer CompletionStore receipts from peers.json paths. Violations: UNKNOWN_PEER, PEER_DEP_UNSATISFIED.
  - depends: multi-repo-merge, verify-kernel
  - produces: src/protocol.ts, src/lib/federation.ts, src/lib/verify.ts
  - validate: shell:npx tsc --noEmit

- [P6] ux-explain: Add `roadmap explain --node <id>`, `roadmap receipts ls [--node <id>]`, `roadmap artifacts ls [--node <id>]`. explain returns: produces existence per file, receipt presence, failing validator, last run, fix suggestions. JSON default, --human optional.
  - depends: receipt-evidence, state-introspection
  - produces: bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

## Phase 7: Tests (parallel)

- [P7] test-plan-selection: Tests for plan-select CLI, receipt format, plan status, verify PLAN_NOT_SELECTED, verify PLAN_INVALIDATED after mutation. Min 8 test cases.
  - depends: plan-select-cmd, verify-kernel
  - produces: tests/plan-selection.test.ts
  - validate: shell:npx vitest run tests/plan-selection.test.ts

- [P7] test-spec-origin: Tests for spec-origin gate — import writes receipt, direct edit triggers SPEC_ORIGIN_VIOLATED, compile_hash match passes. Min 5 test cases.
  - depends: spec-origin-gate, verify-kernel
  - produces: tests/spec-origin.test.ts
  - validate: shell:npx vitest run tests/spec-origin.test.ts

- [P7] test-verify-kernel: Tests for verify command — all violation codes, exit codes, clean state returns violations:[], orphan receipt detection, env-bypass scan, CompletionStore consistency. Min 12 test cases.
  - depends: verify-kernel
  - produces: tests/verify-kernel.test.ts
  - validate: shell:npx vitest run tests/verify-kernel.test.ts

- [P7] test-intake: Tests for intake scan, import, certify — path grouping, NodeSpec shape, intakeFrom provenance, CompletionStore write. Min 6 test cases.
  - depends: intake-compiler
  - produces: tests/intake.test.ts
  - validate: shell:npx vitest run tests/intake.test.ts

- [P7] test-plan-overlay: Tests for plan overlay — write schedule, stale detection, determinism. Min 5 test cases.
  - depends: plan-overlay
  - produces: tests/plan-overlay.test.ts
  - validate: shell:npx vitest run tests/plan-overlay.test.ts

- [P7] test-validator-runner: Tests for validator-runner — env normalization, stdout/stderr capture, sha256, structured result. Min 7 test cases.
  - depends: validator-runner
  - produces: tests/validator-runner.test.ts
  - validate: shell:npx vitest run tests/validator-runner.test.ts

- [P7] test-federation: Tests for federation add/build/status, namespaced IDs, cross-repo dep enforcement. Min 8 test cases.
  - depends: cross-repo-deps
  - produces: tests/federation.test.ts
  - validate: shell:npx vitest run tests/federation.test.ts

- [P7] test-dispatch: Tests for dispatch plan/apply/status, stale overlay detection, receipt format. Min 6 test cases.
  - depends: dispatch-plan
  - produces: tests/dispatch.test.ts
  - validate: shell:npx vitest run tests/dispatch.test.ts

- [P7] test-state-introspection: Tests for status --json counts, remaining list, doctor output. Min 6 test cases.
  - depends: state-introspection
  - produces: tests/state-introspection.test.ts
  - validate: shell:npx vitest run tests/state-introspection.test.ts

- [P7] test-attestation: Tests for check --id roadmap.verify — checkId, treeSha binding, violation passthrough. Min 5 test cases.
  - depends: attestation-emit
  - produces: tests/attestation.test.ts
  - validate: shell:npx vitest run tests/attestation.test.ts

- [P7] test-explain: Tests for explain --node, receipts ls, artifacts ls. Min 6 test cases.
  - depends: ux-explain
  - produces: tests/ux-explain.test.ts
  - validate: shell:npx vitest run tests/ux-explain.test.ts

## Phase 8: Governance Self-Govern + Full Suite

- [P8] governance-self: Write .roadmap/kernel.json prohibiting gate-disable without signed override receipt. Add `roadmap contract test` (JSON envelope + error code + stderr discipline) and `roadmap env-audit` (scan for process.env bypasses) commands.
  - depends: verify-kernel, attestation-emit
  - produces: .roadmap/kernel.json, bin/roadmap.ts, src/lib/verify.ts
  - validate: shell:npx tsc --noEmit

- [P8] full-test-suite: All tests pass. tsc clean. No regressions.
  - depends: test-plan-selection, test-spec-origin, test-verify-kernel, test-intake, test-plan-overlay, test-validator-runner, test-federation, test-dispatch, test-state-introspection, test-attestation, test-explain, governance-self
  - produces: tests/rkg-integration.test.ts
  - validate: shell:npx vitest run
  - validate: shell:npx tsc --noEmit

## Phase 9: Term

- [P9] term: RKG complete — governance kernel hardened, federated attestation, all tests green
  - depends: full-test-suite
  - produces: .roadmap/rkg-complete.json
