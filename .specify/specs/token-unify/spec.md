# Spec: Token Unification

## Definitions

**BoundToken** — a bounded, auditable authorization record with a stable identity, optional TTL, cryptographic binding to repo state, and type-specific payload.

**TokenStore** — the collection of all tokens, indexed at `.roadmap/tokens/index.ndjson`.

**Token type** — one of: `claim`, `strategy`, `breakglass`, `run`.

## Requirements

### R1 — BoundToken schema

```typescript
interface BoundToken {
  schema_version: 1;
  tokenId: string;       // "tok-" + sha256(type+subject+issuedAt)[0:16]
  type: 'claim' | 'strategy' | 'breakglass' | 'run';
  subject: string;       // nodeId for claim, strategyId for strategy, 'global' for breakglass
  owner?: string;        // claim tokens only
  issuedAt: string;      // ISO
  expiresAt?: string;    // null = no expiry (run tokens); required for claim + breakglass
  boundTo: {
    headSha: string;
    treeSha?: string;
    runId?: string;
  };
  scope?: string[];      // breakglass only: command allowlist
  bypass?: string[];     // breakglass only: invariant names bypassed
  reason?: string;       // breakglass only
  payload: Record<string, unknown>;  // type-specific extra fields
  ok: boolean;
}
```

Storage: `.roadmap/tokens/<type>/<tokenId>.json`
Index: `.roadmap/tokens/index.ndjson` — one line per token (tokenId, type, subject, issuedAt, expiresAt, ok)

### R2 — CLI surface

```
roadmap token issue --type <type> --subject <s> [--owner <o>] [--ttl <sec>] [--scope <cmds>] [--bypass <codes>] [--reason <text>]
roadmap token list [--type <type>] [--active]
roadmap token inspect <tokenId>
roadmap token revoke <tokenId>
roadmap token gc        # delete expired tokens + prune index
```

Backward compat: `roadmap claim <node> --owner <o> --ttl <sec>` maps to `roadmap token issue --type claim --subject <node>`.

### R3 — claims.ts migration

`loadClaims()` reads from `.roadmap/tokens/claim/` (not `claims.json`). `saveClaims()` writes BoundToken files. `activeClaims()` filters by `expiresAt`. Shim: if `claims.json` exists, migrate on first read, delete after.

### R4 — latch mechanism deleted

`src/lib/strategy/hints.ts` deleted. `HINT_TOKENS`, `detectHint()`, `shouldLatch()` removed. The latch check in `orient` (`shouldLatch(note) && !isLatched`) is replaced by always-returning `availableStrategies[]` in orient JSON (SGK-1 E5). `strategy/active.json` latch field is ignored on read.

### R5 — strategy receipt becomes token

`selectStrategy()` writes a `BoundToken` with `type: 'strategy'` instead of `StrategyReceipt`. `readActiveStrategy()` reads from token store. `ActiveStrategy` type becomes an alias or is replaced.

### R6 — index and gc

Every token write appends to `index.ndjson`. `roadmap token gc` deletes token files with `expiresAt < now` and rewrites index without them. Index is append-only during normal operation; gc is the only compaction path.

## Acceptance Scenarios

### S1 — claim issued as BoundToken
Given a node in the current batch
When `roadmap token issue --type claim --subject rkg3 --owner w1 --ttl 300`
Then `.roadmap/tokens/claim/tok-<id>.json` exists with type=claim, expiresAt set, boundTo.headSha populated
And `index.ndjson` has a new entry

### S2 — backward compat claim command
Given the old `roadmap claim rkg3 --owner w1 --ttl 300`
Then it produces the same token as S1 (claim type, same fields)

### S3 — expired token excluded from active
Given a claim token with expiresAt in the past
When `roadmap token list --active`
Then the token is not returned

### S4 — latch detection absent
Given `--note "swarm parallel hallucinate"`
When `roadmap orient` runs
Then orient JSON does not include `strategyRequired: true` triggered by note scanning
And `availableStrategies[]` is present regardless (from SGK-1 E5)

### S5 — strategy written as token
Given `roadmap strategy select hybrid`
Then `.roadmap/tokens/strategy/tok-<id>.json` exists with type=strategy, subject=hybrid, no expiresAt

### S6 — gc prunes expired tokens
Given three claim tokens: one expired, two active
When `roadmap token gc`
Then expired token file deleted, index.ndjson has 2 entries, active tokens intact

### S7 — claims.json shim migration
Given `.roadmap/claims.json` exists from a pre-migration repo
When any `loadClaims()` call is made
Then existing claims are migrated to token files, claims.json deleted
