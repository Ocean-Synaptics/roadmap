# Disconnected Systems: Search and Repair

Automated detection and repair of inconsistencies: DAG state mismatches, orphaned files, broken imports, stale completion records, and validation gaps.

## Phase 1: Detector Implementation

- [P0] detector-dag-subsystem: Scan DAG state (head.json vs execution context vs completed.json). Detect mismatches, divergence, orphaned DAGs. Produces: `src/lib/disconnect-detector/dag-subsystem.ts`, `tests/detector/dag.test.ts`
- [P1] detector-file-subsystem: Scan file organization (files in correct locations, no duplicates, no orphaned files in wrong places). Depends: detector-dag-subsystem. Produces: `src/lib/disconnect-detector/file-subsystem.ts`, `tests/detector/files.test.ts`
- [P1] detector-import-subsystem: Scan imports (tsc clean, no broken paths, barrel exports complete, no circular deps). Depends: detector-dag-subsystem. Produces: `src/lib/disconnect-detector/import-subsystem.ts`, `tests/detector/imports.test.ts`
- [P1] detector-completion-subsystem: Scan completion state (records match artifacts, no stale checkpoints, DAG consistency). Depends: detector-dag-subsystem. Produces: `src/lib/disconnect-detector/completion-subsystem.ts`, `tests/detector/completion.test.ts`
- [P1] detector-validation-subsystem: Scan validation rules (artifact paths exist, commands runnable, metrics pass). Depends: detector-dag-subsystem. Produces: `src/lib/disconnect-detector/validation-subsystem.ts`, `tests/detector/validation.test.ts`
- [P1] detector-intent-subsystem: Scan intent gates (gates defined but not run, confidence thresholds not met, expansions pending). Depends: detector-dag-subsystem. Produces: `src/lib/disconnect-detector/intent-subsystem.ts`, `tests/detector/intent.test.ts`
- [P2] disconnect-aggregator: Aggregate findings from all subsystems, generate `DisconnectReport` with severity + repair options. Depends: detector-file-subsystem, detector-import-subsystem, detector-completion-subsystem, detector-validation-subsystem, detector-intent-subsystem. Produces: `src/lib/disconnect-detector/aggregator.ts`, `tests/detector/report.test.ts`

## Phase 2: Repair Engine

- [P1] repair-execution-engine: Execute repair operations (file moves, import updates, completion record migrations). Supports rollback. Depends: disconnect-aggregator. Produces: `src/lib/disconnect-repair/executor.ts`, `tests/repair/executor.test.ts`
- [P1] repair-approval-gates: Approval gates for destructive repairs (moves, deletions, migrations). Non-destructive (updates, re-runs) auto-approve. Depends: repair-execution-engine. Produces: `src/lib/disconnect-repair/approval.ts`, `tests/repair/approval.test.ts`
- [P1] repair-validators: Re-validate system state after repair (tsc, imports, file structure, completions). Depends: repair-approval-gates. Produces: `src/lib/disconnect-repair/post-repair-validation.ts`
- [P2] repair-history-log: Log all repairs applied, who approved, what state before/after, any errors. Depends: repair-validators. Produces: `.roadmap/repairs/history.jsonl`, `src/lib/disconnect-repair/history.ts`

## Phase 3: CLI Integration

- [P1] cli-detect-disconnects: `roadmap detect-disconnects [--subsystems dag,files,imports]`. Scan and report. Depends: disconnect-aggregator. Produces: updated `bin/roadmap.ts`, `tests/cli/detect.test.ts`
- [P2] cli-repair-interactive: `roadmap repair <disconnect-id> <option-idx>`. Interactive repair with approval. Depends: repair-approval-gates. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-interactive.test.ts`
- [P2] cli-repair-auto: `roadmap repair --auto [--dry-run]`. Auto-repair low-risk disconnects. Depends: cli-repair-interactive. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-auto.test.ts`
- [P1] cli-repair-audit: `roadmap repair-audit [--history] [--last N]`. Show repair history + decisions. Depends: repair-history-log. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-audit.test.ts`

## Phase 4: Integration with Constraint Enforcement

- [P2] detector-metric-constraints: Metric violations (file counts, line counts) detected as disconnects. Repair options: expand node with fix, split files, move files. Depends: detector-validation-subsystem. Produces: updated `src/lib/disconnect-detector/validation-subsystem.ts`
- [P2] auto-repair-file-organization: Auto-repair for common case: files unmoved to domains. Generates expansion nodes + applies moves. Depends: detector-metric-constraints. Produces: `src/lib/disconnect-repair/auto-file-repair.ts`
- [P3] detector-intent-convergence-gap: Detect intent gates not run, expansions not applied. Suggest re-run. Depends: auto-repair-file-organization. Produces: updated `src/lib/disconnect-detector/intent-subsystem.ts`

## Phase 5: Heuristics + Learning

- [P3] detector-pattern-learning: Learn common disconnect patterns (DAG switches mid-flight, incomplete refactorings, parallel worker races). Suggest preventive measures. Depends: detector-intent-convergence-gap. Produces: `src/lib/disconnect-detector/patterns.ts`
- [P4] preventive-gates: Add gates to block known bad patterns (DAG switch mid-flight without migration, completion on incomplete refactoring). Depends: detector-pattern-learning. Produces: updated validation rules in roadmap protocol

## Terminal

- [P4] disconnect-repair-fully-integrated: Detector + repair fully automated for common cases, interactive for complex cases. CLI available. Repair history audited. Depends: cli-repair-auto, cli-repair-audit, preventive-gates. Produces: `docs/DISCONNECT-REPAIR.md`, `docs/REPAIR-PATTERNS.md`
- [P4] intent-metaflow-audit-disconnected-systems-repair: Governance audit gate — disconnect-repair implementation verified against metaflow audit compliance. Terminal intent gate. Depends: disconnect-repair-fully-integrated. Produces: audit-evidence collected, repair patterns audited, compliance certified.

## Related Specs
- constraint-enforcement: Metric violations trigger disconnect detection + repair
