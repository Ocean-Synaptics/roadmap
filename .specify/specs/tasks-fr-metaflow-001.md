# Tasks: FR-METAFLOW-001 — Kernelized Meta-flow: Flows Registry + Authority Markers + Mandatory Render Receipts

<!-- Target: roadmap repo
     Constraint: authority.json = source-of-truth for kernel sovereignty; env bypasses prohibited
     Track 1: Init + schemas (mf-sv-init P0)
     Track 2A: Authority marker (mf-sv-authority P1 depends init)
     Track 2B: Flow registry (mf-sv-flow-registry P1 depends init)
     Track 3: Render receipts (mf-sv-render-receipts P2 depends authority)
     Track 4: CLI surface (mf-sv-cli-surface P3 depends flow-registry + render-receipts)
     Track 5: No-env-bypass guards (mf-sv-no-env-bypass P4 depends cli-surface)
     Track 6: Kernel integration (mf-sv-kernel-integration P5 depends no-env-bypass)
     Track 7: Terminal invariants (mf-sv-terminal-invariants P6 depends kernel-integration)
     Terminal: intent-metaflow-sovereignty P7 depends terminal-invariants
     Non-goals: Claude.md enforcement, GitHub branch protection, donjon deep changes -->

- [P0] mf-sv-init: bootstrap metaflow sovereignty scaffolding — flow-schema.ts (flow step types, render field, stage_min/max, requires_authority) and authority-schema.ts (.governance/authority.json: kernel, stage, treeSha, since, receipt); no authority required for init; typecheck clean
  - produces: src/lib/metaflow/flow-schema.ts
  - produces: src/lib/metaflow/authority-schema.ts
  - validate: shell:pnpm -s tsc --noEmit

- [P1] mf-sv-authority: authority.json contract + helpers — read/write/verify treeSha binding; UNGOVERNED state detection (absent authority.json → only metaflow init allowed); authority helpers used by all subsequent commands; unit tests cover: write → read → verify round-trip, treeSha mismatch detection, UNGOVERNED_REPO error
  - depends: mf-sv-init
  - produces: src/lib/metaflow/authority.ts
  - produces: tests/metaflow/authority.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/authority.test.ts

- [P1] mf-sv-flow-registry: flow registry loader + schema validation — INDEX.json + per-flow files under .roadmap/flows/; load + validate on startup; reject malformed flows at load time with structured error; unit tests cover: load valid registry, reject invalid schema, empty registry → empty list
  - depends: mf-sv-init
  - produces: src/lib/metaflow/flows.ts
  - produces: tests/metaflow/flows.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/flows.test.ts

- [P2] mf-sv-render-receipts: mandatory render receipts — store human-readable view as .roadmap/render/<cmd>-<treeSha>.md + JSON sidecar .roadmap/render/<cmd>-<treeSha>.json; metaflow render --last re-renders from last JSON envelope + writes receipt; render receipt required for interactive commands; unit tests: write → read back, re-render idempotent, missing receipt → error on verify
  - depends: mf-sv-authority
  - produces: src/lib/metaflow/render-receipt.ts
  - produces: tests/metaflow/render.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/render.test.ts

- [P3] mf-sv-cli-surface: roadmap metaflow subcommands — init / status / list / run / render / verify; integrate with existing JSON envelope + --human renderer (no second formatting system); metaflow run requires authority.json or returns UNGOVERNED_REPO; unit tests for each command in isolation
  - depends: mf-sv-flow-registry, mf-sv-render-receipts
  - produces: src/lib/metaflow/cli-sovereignty.ts
  - produces: tests/metaflow/cli.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/cli.test.ts

- [P4] mf-sv-no-env-bypass: remove/deny env-variable bypass behavior — any bypass requires explicit receipt written under .roadmap/receipts/ with passed:false + reason; SKIP_* env vars do not affect behavior; test: set SKIP_PLAN_GATE=1 → verify no effect on metaflow run; no global state outside .roadmap/ + .governance/
  - depends: mf-sv-cli-surface
  - produces: src/lib/metaflow/guards.ts
  - produces: tests/metaflow/bypass.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/bypass.test.ts

- [P5] mf-sv-kernel-integration: integrate metaflow with existing kernel invariants — plan-select receipt + spec-origin receipt required for metaflow run when authority.json exists; no logic duplication (bridge to existing kernel, not fork); tests: metaflow run without plan-select receipt → fails; with receipt → proceeds
  - depends: mf-sv-no-env-bypass
  - produces: src/lib/metaflow/kernel-bridge.ts
  - produces: tests/metaflow/kernel-bridge.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/kernel-bridge.test.ts

- [P6] mf-sv-terminal-invariants: metaflow verify — all invariants checked: authority present + kernel correct, schemas valid, receipts treeSha-bound, render receipts present where required, no env bypass active; e2e test suite: A) no plan-select → fail, B) SKIP_PLAN_GATE=1 → no effect, C) --human write render receipt, D) treeSha mismatch → TREE_SHA_MISMATCH, E) no authority.json → UNGOVERNED_REPO on non-init
  - depends: mf-sv-kernel-integration
  - produces: src/lib/metaflow/verify.ts
  - produces: tests/metaflow/verify.e2e.test.ts
  - validate: shell:pnpm -s tsc --noEmit
  - validate: shell:pnpm -s vitest run tests/metaflow/verify.e2e.test.ts

- [P7] intent-metaflow-sovereignty: terminal intent — once authority.json exists, every workflow routes through metaflow and produces render receipts; authority marker is sovereign; no env bypass survives; SOVEREIGNTY.md documents the invariant set and acceptance evidence
  - depends: mf-sv-terminal-invariants
  - mode: plan
  - produces: docs/metaflow/SOVEREIGNTY.md
  - validate: shell:test -f docs/metaflow/SOVEREIGNTY.md
  - validate: shell:pnpm -s tsc --noEmit
