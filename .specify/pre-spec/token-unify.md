# Pre-Spec: Token Unification (token-unify)

## Problem

Three separate implementations of the same concept — bounded, auditable authorization — exist in the codebase with incompatible schemas, separate storage, and separate CLI surfaces:

1. **Claims** (`src/lib/claims.ts`): `{ owner, claimedAt, claimExpiry }` — node ownership with TTL. Advisory only. Stored in `.roadmap/claims.json`.
2. **Strategy latch** (`src/lib/strategy/hints.ts` + `active.ts`): `{ matchedTokens, latched, latchedAt }` — triggered by substring match on `--note` text against `HINT_TOKENS`. No TTL, no runId binding, persists across sessions silently.
3. **Strategy receipt** (`src/lib/strategy/schema.ts`): `{ strategyId, runId, headSha, treeSha, selectedAt }` — proper binding but separate schema from claims.
4. **SGK-1 breakglass** (planned): `{ id, openedAt, expiresAt, scope, reason }` — TTL + scope, yet another schema.

The hint/latch mechanism is the most problematic: free-text substring matching on `--note` is fragile, the latch has no TTL (ghost latch from yesterday blocks today's work), and SGK-1 E5 makes it redundant by always surfacing `availableStrategies[]` in orient JSON.

## Desired State

Single `BoundToken` type covering all four use cases. Single storage at `.roadmap/tokens/<type>/<tokenId>.json` with an index at `.roadmap/tokens/index.ndjson`. Single CLI surface: `roadmap token issue/list/inspect/revoke/gc`.

`hints.ts` and the latch detection mechanism are deleted entirely.

## Constraints

- Backward compatibility: `roadmap claim` continues to work as a shorthand (maps to `roadmap token issue --type claim`)
- `strategy/active.json` format preserved during migration, deprecated after
- No behavior change to claim TTL semantics
- `breakglass` token type maps exactly to SGK-1 breakglass receipt schema

## Key Files

- `src/lib/claims.ts` — current claim store
- `src/lib/strategy/hints.ts` — HINT_TOKENS, detectHint, shouldLatch (DELETE)
- `src/lib/strategy/active.ts` — latch state + active strategy (REPLACE with token reads)
- `src/lib/strategy/schema.ts` — StrategyReceipt, ActiveStrategy (subsume into BoundToken)
- `src/lib/strategy/select.ts` — selectStrategy writes strategy receipt (update to write token)
- `bin/roadmap.ts` — claim command, strategy latch reads (update surface)
