# FR: Intent constraints — LLM-evaluated behavioral validation

## Problem

Validation today is binary: deterministic checks that either pass or fail. `artifact-exists` confirms a file was written. `shell` confirms a command exited 0. `build-produces` confirms a build emitted outputs. `spec-conformance` confirms a scenario is addressed in code.

None of these answer: **does the output actually do what was intended?**

The gap between "file exists + types check" and "app works correctly" is where iteration 1's 10 integration bugs lived. All 42 nodes passed their validators. The app didn't launch.

Deterministic validators catch structural problems. Playwright E2E catches behavioral problems but requires infrastructure, is slow, and overfits to DOM structure. The middle ground is missing: a validator that evaluates behavioral intent against produced artifacts without hardcoding expected structure.

### The overfitting problem

If the same model writes the contracts, writes the implementation prompts, and writes the structural test assertions — the test is tautological. It validates "did you produce what I told you to produce" not "does this work." Predicting DOM structure in a launch-check means baking implementation assumptions into the test. A different valid implementation would fail the test despite working correctly.

## Proposal

### New ValidationRule type: `intent`

```typescript
interface IntentConstraint {
  type: 'intent'
  statement: string        // natural-language behavioral assertion
  confidence: number       // threshold, 0.0–1.0 (default: 0.8)
  evaluator: 'self' | 'council'  // who evaluates
  context?: string[]       // file paths to read for evaluation (default: node's produces)
}
```

### Evaluation

The evaluator (an LLM) receives:
- The intent `statement`
- The contents of `context` files (or the node's `produces` if not specified)
- No other project context — evaluation is scoped

It returns:
```typescript
interface IntentEvaluation {
  pass: boolean            // confidence >= threshold
  confidence: number       // 0.0–1.0
  reasoning: string        // one paragraph: why this confidence
  evidence: string[]       // file:line references supporting the judgment
}
```

Evaluations are recorded to `.roadmap/evaluations/<node-id>.jsonl` — append-only audit trail. Every judgment is logged, including failures.

### Examples for todo-app

**On `electron-main` node:**
```json
{
  "type": "intent",
  "statement": "electron/main.ts creates a BrowserWindow that loads the renderer's index.html, registers IPC handlers for todo CRUD operations, and does not expose Node APIs to the renderer process",
  "confidence": 0.85,
  "evaluator": "self"
}
```

**On `renderer-store` node:**
```json
{
  "type": "intent",
  "statement": "The todo store maintains a sorted list where incomplete todos appear before completed todos, both groups ordered newest-first, and rejects empty or whitespace-only submissions",
  "confidence": 0.85,
  "evaluator": "self"
}
```

**On `integration-validated` node:**
```json
{
  "type": "intent",
  "statement": "The built Electron application can launch without crashing, display a window, and accept user input for creating todos",
  "confidence": 0.8,
  "evaluator": "council",
  "context": ["electron/main.ts", "electron/preload.ts", "src/main.ts", "src/App.vue", "electron.vite.config.ts"]
}
```

### Tiered evaluation in `roadmap complete`

Intent constraints are expensive (LLM calls). They should not run on every `complete`. Three tiers:

| Tier | Validators | Latency | When |
|---|---|---|---|
| Deterministic | `artifact-exists`, `shell`, `build-produces` | <100ms | Always (default `complete`) |
| Intent (self) | `intent` with `evaluator: 'self'` | 5–60s | On `complete --evaluate` |
| Intent (council) | `intent` with `evaluator: 'council'` | 30–180s | On `complete --evaluate=council` |

Default `complete` runs deterministic only. Unevaluated intent constraints are returned as `{ status: 'unevaluated' }` in the result — visible but non-blocking. Explicit `--evaluate` triggers intent evaluation and blocks on confidence threshold.

### Why not just write better shell validators?

Shell validators test observable behavior through commands. Intent constraints test behavioral properties through code reading. They're complementary:

- `shell: npx vitest run` — tests pass (observable)
- `intent: "the store rejects whitespace-only input"` — property holds (code review)

A test suite can have gaps. Intent evaluation reads the actual implementation and judges whether the property holds regardless of test coverage. It catches the class of bugs where tests pass but the code doesn't actually do what was intended.

### Why not Playwright E2E?

Playwright is the right answer for interaction testing. Intent constraints are the right answer for code-level behavioral validation. Different layers:

- Intent: "does this code implement the spec's intention?" (code review by LLM)
- Playwright: "does this running app behave correctly?" (interaction testing)
- Shell/vitest: "do the unit tests pass?" (test execution)

Intent constraints require no browser, no DOM, no running application. They evaluate source code against behavioral statements. Faster, cheaper, and don't overfit to implementation structure.

## Integration with compile-prompts

When `compile-prompts` generates a per-node worker prompt, the intent constraints become the "Verification" section's behavioral checklist. The worker sees:

```markdown
## 5. Verification
- [ ] Tests pass: `npx vitest run tests/unit/db.test.ts`
- [ ] Types clean: `npx tsc --noEmit`
- [ ] Intent: "CRUD operations are synchronous — write completes before function returns"
- [ ] Intent: "theme persistence uses the app data directory, not :memory:"
```

The worker can self-check against intent statements before calling `complete`. The formal evaluation at `complete --evaluate` is the gate.

## Scope

- New type in `src/protocol.ts`: `IntentConstraint` added to `ValidationRule` union
- New: `src/lib/intent-evaluator.ts` — scoped LLM call, confidence scoring, evaluation recording
- Modify: `src/lib/validate.ts` — handle `intent` type, tiered execution based on flags
- Modify: `bin/roadmap.ts` — `complete --evaluate` and `complete --evaluate=council` flags
- New: `.roadmap/evaluations/` directory for audit trail
- Tests: evaluation recording, confidence thresholding, tiered execution, context scoping

## Not in scope

- Evaluator model selection (always uses the calling model's API)
- Cross-node intent evaluation (each node evaluated independently)
- Intent constraint generation from spec (future: spec → intent statements automatically)
- Council routing protocol (reuses existing adversarial review structure)
