# Tasks: Token Unification

## tu-schema
desc: BoundToken type definition, TokenStore read/write, storage layout at .roadmap/tokens/<type>/<id>.json, index.ndjson append
produces: [src/lib/token-store.ts]
consumes: []
deps: [token-unify-plan]
validate:
  - shell: npx tsc --noEmit
  - artifact-exists: src/lib/token-store.ts
mode: execute

## tu-claims-migrate
desc: Migrate claims.ts to read/write BoundToken files. loadClaims reads .roadmap/tokens/claim/, saveClaims writes token files. Shim migrates claims.json on first read.
produces: [src/lib/claims.ts]
consumes: [src/lib/token-store.ts]
deps: [tu-schema]
validate:
  - shell: npx tsc --noEmit
  - shell: grep -q 'tokens/claim' src/lib/claims.ts
mode: execute

## tu-strategy-migrate
desc: Delete src/lib/strategy/hints.ts. Update strategy/active.ts latch to no-op. Update selectStrategy() to write BoundToken type=strategy. Remove latch check from orient.
produces: [src/lib/strategy/active.ts, src/lib/strategy/select.ts]
consumes: [src/lib/token-store.ts]
deps: [tu-schema]
validate:
  - shell: npx tsc --noEmit
  - shell: "! test -f src/lib/strategy/hints.ts"
  - shell: grep -q 'BoundToken' src/lib/strategy/select.ts
mode: execute

## tu-cli-surface
desc: Add roadmap token subcommand — issue/list/inspect/revoke/gc. Wire old `roadmap claim` as shorthand to token issue --type claim.
produces: [bin/roadmap.ts]
consumes: [src/lib/token-store.ts]
deps: [tu-schema]
validate:
  - shell: bin/roadmap token list 2>/dev/null | python3 -m json.tool > /dev/null
  - shell: npx tsc --noEmit
mode: execute

## tu-index-gc
desc: Token index writer (append to index.ndjson on every issue) and gc command (prune expired files + rewrite index).
produces: [src/lib/token-index.ts]
consumes: [src/lib/token-store.ts]
deps: [tu-schema]
validate:
  - shell: npx tsc --noEmit
  - artifact-exists: src/lib/token-index.ts
mode: execute

## tu-tests
desc: Tests for S1-S7 acceptance scenarios — claim as token, backward compat, expiry filter, latch absent from orient, strategy as token, gc prune, claims.json shim migration.
produces: [src/tests/token-unify.test.ts]
consumes: [src/lib/token-store.ts, src/lib/claims.ts, src/lib/strategy/select.ts, src/lib/token-index.ts]
deps: [tu-claims-migrate, tu-strategy-migrate, tu-cli-surface, tu-index-gc]
validate:
  - shell: npx vitest run src/tests/token-unify.test.ts
  - artifact-exists: src/tests/token-unify.test.ts
mode: execute
