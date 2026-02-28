# FR-CLI-001: JSON Output Contract

## Envelope Schema

### Success (`ok: true`)

```json
{
  "schema_version": 1,
  "ok": true,
  "cmd": "orient",
  "repoRoot": ".",
  "headSha": "abc123...",
  "data": { ... }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schema_version` | `number` | yes | Integer. Increments on breaking changes only. |
| `ok` | `true` | yes | Success discriminant. |
| `cmd` | `string` | yes | Command that produced this output (e.g. `orient`, `complete`, `chart`). |
| `repoRoot` | `string` | yes | Repo root relative to cwd, or absolute path. |
| `headSha` | `string` | yes | SHA256 of `.roadmap/head.json` at read time. Detects stale pointers. |
| `data` | `object` | yes | Command-specific payload. Shape varies per `cmd`. |

### Failure (`ok: false`)

```json
{
  "schema_version": 1,
  "ok": false,
  "cmd": "orient",
  "error": {
    "code": "PLAN_NOT_SELECTED",
    "message": "No selected plan for current head",
    "fix": ["roadmap plan --gallery", "roadmap plan select <id>"]
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schema_version` | `number` | yes | Same version as success envelope. |
| `ok` | `false` | yes | Failure discriminant. |
| `cmd` | `string` | yes | Command that failed. |
| `error.code` | `string` | yes | Machine-readable. One of the canonical codes below. |
| `error.message` | `string` | yes | Human-readable single line. |
| `error.fix` | `string[]` | yes | Ordered recovery commands. Empty array if no fix known. |

`repoRoot` and `headSha` are omitted on failure — they may not be resolvable.

## Canonical Error Codes

| Code | Exit | Meaning |
|------|------|---------|
| `PLAN_NOT_SELECTED` | 1 | No plan pointer for current head. |
| `HEAD_SHA_MISMATCH` | 1 | Plan pointer stale after `head.json` mutation. Re-orient. |
| `VALIDATION_FAILED` | 1 | Node validation rule(s) failed. `error.fix` contains failing rules. |
| `NODE_NOT_FOUND` | 1 | Referenced node ID does not exist in the DAG. |
| `BATCH_INCOMPLETE` | 1 | Advance attempted but current batch has incomplete nodes. |
| `DAG_INVALID` | 1 | `define()`, `verify()`, or `check()` failure. Structural defect. |
| `CLAIM_CONFLICT` | 1 | Node already claimed by another agent. |
| `COMPLETION_REJECTED` | 1 | `complete` command validation rejected the submission. |
| `INTERNAL_ERROR` | 2 | Uncaught exception or invariant violation. Bug. |

New codes may be added without a schema version bump. Removing or renaming a code is breaking.

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | `ok: true` |
| `1` | `ok: false`, user-actionable error |
| `2` | `ok: false`, internal error / bug (`INTERNAL_ERROR`) |

## Output Streams

| Stream | Content | Machine-parseable |
|--------|---------|-------------------|
| `stdout` | JSON envelope (success or failure) | yes |
| `stderr` | Human diagnostic lines: logs, warnings, stack traces | no |

stderr must never contain data required by machine consumers. The `--quiet` flag suppresses non-fatal stderr.

## Output Mode Precedence

| Priority | Flag | Behavior |
|----------|------|----------|
| 1 (highest) | `--json` | Force JSON output. Overrides all other flags. |
| 2 | `--human` | Formatted text for interactive use. |
| 3 (default) | _(none)_ | JSON. |

When `--human` is active, stdout is unstructured text. Programmatic consumers must use `--json` or rely on the default.

## Stability Promise

### Non-breaking (no schema_version bump)

- Adding new fields to `data`
- Adding new error codes
- Adding new commands (new `cmd` values)
- Adding optional fields to the envelope

### Breaking (requires schema_version increment)

- Removing or renaming fields in `data`
- Removing or renaming error codes
- Changing the type of an existing field
- Changing envelope structure
- Changing exit code semantics

Consumers must tolerate unknown fields (forward compatibility). Consumers must check `schema_version` and reject versions they do not support.

## TypeScript Types

```typescript
interface CLIEnvelope<T = unknown> {
  schema_version: number;
  ok: boolean;
  cmd: string;
  repoRoot?: string;
  headSha?: string;
  data?: T;
  error?: CLIError;
}

interface CLIError {
  code: ErrorCode;
  message: string;
  fix: string[];
}

type ErrorCode =
  | 'PLAN_NOT_SELECTED'
  | 'HEAD_SHA_MISMATCH'
  | 'VALIDATION_FAILED'
  | 'NODE_NOT_FOUND'
  | 'BATCH_INCOMPLETE'
  | 'DAG_INVALID'
  | 'CLAIM_CONFLICT'
  | 'COMPLETION_REJECTED'
  | 'INTERNAL_ERROR';
```

Discriminated union: if `ok === true`, `data` is present and `error` is absent. If `ok === false`, `error` is present and `data` is absent.
