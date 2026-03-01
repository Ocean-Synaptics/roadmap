# Metaflow Sovereignty Invariants

Kernel: `roadmap` — FR-METAFLOW-001

## Invariant Set

Once `.governance/authority.json` exists, the following invariants hold unconditionally:

| # | Invariant | Enforced by | Failure code |
|---|-----------|-------------|--------------|
| 1 | `authority.json` present + `kernel = "roadmap"` | `verify.ts → checkAuthority` | `UNGOVERNED_REPO` |
| 2 | All flow files in `.roadmap/flows/` pass schema validation | `verify.ts → checkFlowRegistry` | `FLOW_MALFORMED` / `INDEX_MALFORMED` |
| 3 | `authority.json.treeSha` matches `git rev-parse HEAD^{tree}` | `verify.ts → checkTreeSha` | `TREE_SHA_MISMATCH` |
| 4 | At least one render receipt in `.roadmap/render/` | `verify.ts → checkRenderReceipts` | `RENDER_DIR_EMPTY` |
| 5 | `SKIP_*` env vars are inert — no behavior change | `guards.ts → checkEnvBypass` | n/a (always passes) |

## Authority Marker

`.governance/authority.json` schema:

```typescript
interface AuthorityJson {
  kernel: 'roadmap' | 'donjon';
  stage: 0 | 1 | 2 | 3;
  treeSha: string;   // git rev-parse HEAD^{tree} at time of write
  since: string;     // ISO 8601
  receipt: string;   // path under .roadmap/receipts/ authorizing last change
}
```

Absent = UNGOVERNED state. Only `roadmap metaflow init` is permitted in this state.

## Bypass Policy

`SKIP_*` environment variables (`SKIP_PLAN_GATE`, `SKIP_VALIDATE`, etc.) are **detected and logged but never honored**. Sovereignty checks run unconditionally.

Any legitimate bypass requires an explicit receipt written to `.roadmap/receipts/bypass-<timestamp>.json` with `passed: false`. This is an audit record, not authorization.

## Render Receipts

Every interactive `metaflow` command writes:
- `.roadmap/render/<cmd>-<treeSha>.md` — human-readable view
- `.roadmap/render/<cmd>-<treeSha>.json` — JSON sidecar for re-render

The treeSha suffix binds each receipt to the git tree state at render time. Stale receipts are identifiable by SHA mismatch.

## Acceptance Evidence

All 5 scenarios verified by `tests/metaflow/verify.e2e.test.ts`:

| Scenario | Test | Result |
|----------|------|--------|
| A) No plan-select receipt → fail | `Scenario A` | `plan-select` check `ok:false` |
| B) `SKIP_PLAN_GATE=1` → no effect | `Scenario B` | `env-bypass` check `ok:true`, plan-select still fails |
| C) Render receipt written → present | `Scenario C` | `render-receipts` check `ok:true` |
| D) treeSha mismatch → fail | `Scenario D` | `treeSha` check `ok:false`, detail contains "mismatch" |
| E) No authority.json → UNGOVERNED_REPO | `Scenario E` | `authority` check `ok:false`, detail contains "UNGOVERNED_REPO" |

## Module Map

| Module | Purpose |
|--------|---------|
| `authority-schema.ts` | `AuthorityJson` type + guard |
| `authority.ts` | read/write/verify authority.json |
| `flow-schema.ts` | `Flow`, `FlowStep`, `FlowValidateRule` types + guards |
| `flows.ts` | flow registry loader (INDEX.json + per-flow files) |
| `render-receipt.ts` | write/read render receipts (.md + .json) |
| `cli-sovereignty.ts` | `cmdInit`, `cmdStatus`, `cmdList`, `cmdRun`, `cmdRender`, `cmdVerify` handlers |
| `guards.ts` | `checkEnvBypass` + `writeBypassReceipt` |
| `kernel-bridge.ts` | `requirePlanSelectReceipt`, `enforceKernelInvariants` — bridges to plan-gate |
| `verify.ts` | `verifyAll` — runs all 5 invariant checks |
