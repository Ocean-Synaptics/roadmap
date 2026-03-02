# CLI Integration Hardening — FR-CLI-HARDENING-001

## Domain Concepts
- **CLI Surface**: orient, show, complete, advance, chart, compile-brief, spec-kit, mf (metaflow)
- **Integration Points**: DAG loading, state persistence, validation chain, output serialization
- **Failure Modes**: invalid JSON output, race conditions on claims, missing error codes, unhandled exceptions

## Acceptance Scenarios

### Given a roadmap with incomplete batch
When running `roadmap complete <node>` on a non-current-batch node
Then exit code 1 + error JSON with fix suggestion

### Given spec-kit intake workflow
When running `roadmap spec-kit init <dag-id>` with valid intent
Then creates `.roadmap/spec/<dag-id>/` with skeleton files + agent brief

### Given metaflow mining enabled
When running any command with `--mf-run <runId>`
Then writes structured JSON to metaflow run directory + exit code indicates success/failure

### Given output format flags
When running any command with `--json` or `--text`
Then output matches declared format (no mixed text/JSON)

### Given concurrent claims
When agent A and agent B both try to `complete` the same node
Then only one succeeds, other gets "claimed by X" error with expiry timestamp

### Given state corruption scenario
When completed.json is stale vs head.json
Then `roadmap completion doctor` detects mismatch + suggests `completion compact`

## Constraints
- All commands must emit valid JSON on stderr/stdout (no raw text mixed in)
- Exit codes: 0=success, 1=user error, 2=system error, 3=permission/state error, 4=validation error
- No blocking pre-commit hooks during execution (use SKIP_* env vars)
- Metaflow runs must be self-contained (no external dependencies)

## Edge Cases
- DAG with circular dependencies → define() rejects + exit 2
- Node with zero produces → orient marks it complete if all deps satisfied
- Claim expiry during command execution → graceful abort with state snapshot
- Multi-DAG environment → roadmap commands are repo-scoped, not global
