# Fixup: Intent Expansion + Runtime Explore — Course Corrections

**Target**: Agent implementing FR-INTENT-EXPANSION and FR-RUNTIME-EXPLORE
**Priority**: These are hard requirements, not nice-to-haves

## Correction 1: Terminal intent gate is a HARD invariant

Every roadmap must terminate with an intent gate that has `expandOnFail: true`. This is not a recommendation — it is enforced by the CLI. DAGs that lack this are **rejected** at creation time.

**What this means for implementation:**
- `validateDAG()` must check terminal nodes for `expandOnFail: true` intent rules
- `roadmap expand`, `roadmap import`, and manual `head.json` writes all call `validateDAG()`
- Rejection is an error, not a warning. The DAG does not get committed.
- The only bypass is `--skip-validate` with human instruction + audit trail

**Do not** implement this as a lint rule or advisory check. It is a structural invariant — same category as "DAG must be acyclic." A roadmap without a terminal intent gate can produce "done" without behavioral validation. That's the bug this fixes.

## Correction 2: Intent gates can be visual, not just code-based

The `IntentRule` type now includes an `explore` field:

```typescript
interface IntentRule {
  type: 'intent'
  statement: string
  confidence: number
  evaluator: 'self' | 'council'
  context?: string[]
  expandOnFail?: boolean
  maxExpansionDepth?: number
  explore?: string              // <-- THIS IS NEW AND CRITICAL
}
```

When `explore` is set, the intent evaluation pipeline runs a CDP-based explore script against the live application **before** the evaluator judges the statement. The explore script produces structured observations (DOM state, computed styles, visibility, interaction results). These observations become evidence for the judgment.

**What this means for implementation:**

1. **`validateNode()` in protocol.ts**: When processing an intent rule with `explore`, run the explore script first. The script's observations are passed to the evaluator alongside source context.

2. **Explore script execution**: The script must be run with the app launched (`--remote-debugging-port=9222`). The launch command is inferred from `package.json` or specified in the intent rule. The explore script exits 0 if observations were collected, non-zero on crash/timeout.

3. **Expansion with visual evidence**: When a visual intent fails and triggers expansion, the `_intentDiagnosis` on fix nodes must include the explore observations. This is the difference between "dark mode doesn't work" (useless) and `{ textColor: "rgb(255,255,255)", bgColor: "rgb(255,255,255)" }` (actionable — white on white, contrast 1:1).

4. **Terminal intent gates for UI apps should default to visual**: When `roadmap init` prompts for the terminal intent statement and the project has an Electron/web entry point, suggest an explore-backed intent as the default.

## Why this matters

Iterations 1 and 2 both converged with all deterministic gates passing. Both had runtime bugs. The three iter2 bugs (ABI mismatch, white-on-white text, invisible toggle) share one property: **correct code, broken application**. Source-level evaluation — whether by compiler, test runner, or LLM reading code — cannot catch these.

The visual intent gate is the fix. It runs an explore script against the live app. If the toggle isn't visible, `isVisible()` returns false. If text is white on white, `getComputedStyle().color` shows it. If the app crashes on launch, the explore script fails to connect.

Without visual intent gates, the terminal invariant only catches bugs visible in source code. With them, it catches bugs visible in the running application. The system keeps expanding until the app **actually works**, not until the code **looks right**.

## Composition: visual intent + expansion + gallery

```
gallery: 4 candidates → deterministic gates filter → intent gates score
  → visual intent: explore script runs against each surviving candidate
  → candidate A: explore shows toggle invisible (confidence 0.4)
  → candidate B: explore shows dark mode broken (confidence 0.3)
  → candidate C: explore shows all working (confidence 0.95) ← selected
  → if no candidate passes visual intent:
    → select best (C at 0.72)
    → expansion: fix nodes from explore observations
    → fix nodes execute with CDP evidence in diagnosis
    → re-validate: explore re-runs → passes
    → DAG closes
```

This is the closed loop: **perceive** (explore) → **judge** (intent evaluator) → **act** (expansion fix nodes) → **re-perceive** (explore re-runs). It terminates when perception confirms the intent, or when depth/stall limits trigger escalation.

## Files to modify

- `src/protocol.ts` — `IntentRule.explore` field, visual intent evaluation path in `validateNode()`
- `src/lib/intent-expansion.ts` — include explore observations in `_intentDiagnosis`
- `src/lib/validate-dag.ts` — `validateTerminalIntentGate()` hard enforcement
- `bin/roadmap.ts` — `cmdComplete` runs explore scripts, `cmdExpand`/`cmdImport` call `validateDAG()`
- FR-RUNTIME-EXPLORE's explore runner (`src/lib/explore-runner.ts`) — launched by intent validation, returns structured observations

## Do not

- Implement visual intent as a separate validation rule type. It is an intent rule with an `explore` field — same type, richer evidence.
- Make the terminal invariant optional or configurable. It is always on. `--skip-validate` is the escape hatch, and it requires human instruction.
- Run explore scripts in parallel with deterministic gates. Explore needs a running app; deterministic gates (tsc, vitest, build) must pass first to produce a launchable artifact.
- Generate explore scripts automatically. The scripts are authored (by human or LLM during DAG planning), not generated from intent statements. The script is the test; the intent statement is the acceptance criterion.

---

## Post-Launch Implementation Status

### Shipped (2026-02-27)
- ✅ **FR-INTENT-EXPANSION core**: `generateIntentExpansion()`, `resolveProduces()`, `detectStall()`, `buildEscalation()` in `src/lib/intent-expansion.ts`
- ✅ **validateNode integration**: `expandOnFail` routing, `ValidationResult.expansionStatus`, `_intentDiagnosis` provenance
- ✅ **CLI integration**: `bin/roadmap.ts` complete command routes to expansion, returns `{ status: 'expanding' }`
- ✅ **FR-RUNTIME-EXPLORE infrastructure**: `launchApp()`, `runExploreScript()`, CDP polling, observation parsing in `src/lib/runtime-explore.ts`
- ✅ **Validation tier integration**: `--explore` flag in complete command, explore results passed to validateNode
- ✅ **Test coverage**: 42 intent-expansion tests, 17 runtime-explore tests, all passing

### Known Gaps (Next Phase)
1. **Terminal intent gate enforcement**: `validateDAG()` must reject DAGs without terminal intent with `expandOnFail: true`. Currently not enforced at DAG creation time.
2. **Visual intent evaluation**: `IntentRule.explore` field defined but evaluation path not fully wired. Explore observations need to flow into intent evaluator as evidence.
3. **Expansion script file I/O**: `generateIntentExpansion()` produces FixNodeSpec[] directly; should write `.roadmap/expansions/expand-<id>-<timestamp>.ts` for review/audit.
4. **Cost budget enforcement**: `maxExpansionCost` defined but not tracked. Sum of fix node costs should escalate if exceeded.
5. **History collection**: Confidence progression across recursion levels not collected. Needed for proper stall detection and escalation evidence.

### Integration Readiness
- ✅ Ready for `/roadmap-expand` agent skill (wraps expansion script generation + commit)
- ✅ Ready for `/roadmap-validate` pre-check skill (calls validateNode with intent evaluation)
- ✅ Ready for `/roadmap-escalate` skill (surfaces escalation with AskUserQuestion)
- ⏳ Waiting for terminal intent gate enforcement before consider "intent-backed convergence" complete
- ⏳ Waiting for visual intent wiring before "visual terminal gate" complete

### Priority Fixes (Order)
1. Terminal intent gate validation (blocking DAG creation)
2. Visual intent evaluation path (enables explore observations in intent judgment)
3. Expansion script file I/O (enables auditability + review)
4. Cost budget tracking (enables per-template cost caps in plan-gallery)
5. History collection + escalation enrichment (enables observable convergence debugging)
