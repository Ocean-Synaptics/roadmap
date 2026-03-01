# Receipt-First CLI Governance

## Problem

LLM agents can free-run CLI commands outside the DAG without producing audit evidence. The existing `InteractionReceiptWriter` covers metaflow interactions but not core CLI commands (`orient`, `complete`, `validate`, etc.). No mechanism gates command execution on prior receipt chains. Env-variable bypasses (`SKIP_BATCH_COMMIT`) allow silent policy evasion with no audit trail.

## Desired State

Every CLI command writes a `CmdReceipt` — even on failure. Scenario definitions require receipt chains before commands execute. Breakglass is the only escape hatch, and it is itself a receipt with TTL, scope, and mandatory follow-ups. Env-variable bypass surfaces are removed from allow-decisions.

## Key Files

- `src/lib/metaflow/receipt-writer.ts` — existing InteractionReceiptWriter (interaction-level, not command-level)
- `src/lib/metaflow/command-registry.ts` — existing command config (receiptRequired flag, metaflow-scoped)
- `bin/roadmap.ts` — CLI entry point, all commands route through here
- `src/lib/cli-envelope.ts` — output envelope (emit/emitError), headSha binding

## Constraints

- Receipt writing must not be bypassable — even breakglass writes receipts
- Receipt binding uses treeSha (preferred) or headSha (fallback) for cryptographic state binding
- Breakglass requires TTL, scope, and follow-up chain — unbounded bypass is not breakglass
- Env reads become informational only — no allow-decisions from env vars
- All commands route through a single enforcement funnel before executing
