# FR: Emit gallery — candidate repository generation with blend selection

## Problem

Current code generation is single-path: one agent (or one swarm) produces one implementation. If the output has defects, you fix forward — diagnose, patch, re-validate. There is no mechanism to compare alternative implementations or recover partial value from flawed candidates.

Iteration 2 demonstrated the cost: a single Opus-orchestrated swarm produced a buildable app with 3 runtime bugs. Fixing those bugs took 24 minutes of manual pixel-squinting. The bugs were in predictable categories (CSS dark mode strategy, native module bundling, UI discoverability) that different implementation approaches would handle differently.

Code generation has a property that makes gallery selection viable: **automated verification**. Unlike prose, code can be compiled, tested, and judged by intent gates. Multiple candidates can be scored on the same rubric without human evaluation of each.

## Proposal

### `roadmap emit --gallery`

Generates N candidate implementations in parallel. Each candidate is a complete working tree. Deterministic gates filter non-compiling candidates. Intent gates score survivors. The calling LLM selects from scorecards, not from raw code.

```bash
roadmap emit --gallery --candidates 4 --from spec.md
roadmap emit --gallery --candidates 4 --from .roadmap/head.json
```

### Candidate generation

Each candidate is produced by a different generation strategy:

| Candidate | Strategy | Typical profile |
|---|---|---|
| Faithful | Spec-literal implementation, no embellishment | Matches spec exactly, may be verbose |
| Minimal | Fewest files, simplest architecture that satisfies spec | Lean, may miss edge cases |
| Robust | Defensive coding, comprehensive error handling | More code, fewer runtime surprises |
| Budget | Haiku-generated with same spec input | Cheap, quality varies with prompt quality |

Strategies are parameterized, not hardcoded. The gallery system selects which strategies to include based on spec complexity and tech stack analysis.

### Parallel generation

All candidates generate concurrently. Same spec input, different system prompts encoding the strategy. Wall-clock cost = max(candidate_time), not sum(candidate_times).

```
spec ──┬── emit(faithful) ──┬── [tsc + vitest + build] ──┬── scorecard
       ├── emit(minimal)  ──┤                             ├── scorecard
       ├── emit(robust)   ──┤                             ├── scorecard
       └── emit(budget)   ──┘                             └── scorecard
                                                               │
                                                          select/blend
```

### Gate execution

Each candidate runs the same gate suite independently:

```typescript
interface CandidateResult {
  id: string
  strategy: string
  files: Record<string, string>     // path → content
  deterministic: {
    tsc: { pass: boolean, errors?: string[] }
    vitest: { pass: boolean, passed: number, failed: number, coverage: number }
    build: { pass: boolean, outputs?: string[] }
  }
  intent: Array<{
    statement: string
    pass: boolean
    confidence: number
    reasoning: string
    evidence: string[]
  }>
  summary: {
    loc: number
    fileCount: number
    deterministicPass: boolean
    intentScore: string             // "5/6", "6/6", etc.
    estimatedCost: number
  }
}
```

### Scorecard rendering

```
$ roadmap emit --gallery --candidates 4

  Candidate    Files  LOC   tsc  vitest    build  intent   cost
  ─────────────────────────────────────────────────────────────
  A: faithful    18   890    ✓   51/51 76%   ✓    6/6     $2.10
  B: minimal     12   340    ✓   51/51 82%   ✓    5/6     $1.40
  C: robust      21  1120    ✓   51/51 81%   ✓    6/6     $2.80
  D: budget      15   780    ✓   48/51 68%   ✓    5/6     $0.30

  Deterministic survivors: A, B, C, D (all compile + build)
  Intent survivors: A, C (B: theme persistence, D: CSV escaping)

  Select [A/B/C/D/blend]:
```

### Selection

Uses the same `Judgment` schema as intent gates and plan-gallery (see FR-PLAN-GALLERY):

```bash
# Direct selection
roadmap emit --gallery --select A

# LLM-evaluated selection (same Judgment schema as complete --evaluate)
roadmap emit --gallery --evaluate '[{
  "statement": "this candidate best satisfies the spec given gate results",
  "confidence": 0.9,
  "reasoning": "Full intent coverage, spec-faithful, acceptable cost"
}]'

# Blend selection
roadmap emit --gallery --blend "A+D"
```

Selection is recorded to `.roadmap/evaluations/emit-selection.jsonl` with `phase: "emit-selection:<gallery-run-id>"`. One audit trail across all judgment types.

### Blend operation

Blend takes files from multiple candidates, resolving conflicts with intent gates:

```typescript
interface BlendSpec {
  primary: string           // base candidate (architecture source)
  donors: string[]          // candidates to pull cheaper implementations from
  resolution: 'intent'      // conflict resolution strategy
}

// Built at evaluation time from the intent rules' contextPaths fields.
// Intent rules are statement→files; blend needs the inverse.
// Example: { statement: "store rejects whitespace", contextPaths: ["src/stores/todoStore.ts"] }
// → { "src/stores/todoStore.ts": ["store rejects whitespace"] }
type FileToIntents = Record<string, string[]>
```

**Algorithm:**

1. Build `fileToIntents` index by inverting each intent rule's `contextPaths` (falls back to node `produces` when `contextPaths` not specified, matching `validateNode` behavior).
2. Start with primary candidate's full file set
3. For each file in donor candidates:
   - Look up `fileToIntents[path]` — all intent statements that cover this file
   - If the donor's version passed ALL of those intent checks AND is cheaper (fewer tokens to generate), substitute it
   - If substitution breaks a deterministic gate (tsc, vitest), revert
4. Re-run full gate suite on blended result
5. If blend fails gates that all source candidates passed, discard blend and fall back to primary

**Use case:** Take A's architecture (spec-faithful, full IPC, correct dark mode) but substitute D's simpler utility files where they pass intent. Result: A's correctness at closer to D's cost.

### Working tree management

Candidates are generated into isolated working trees:

```
.roadmap/gallery/
  candidate-A/          # full working tree
  candidate-B/
  candidate-C/
  candidate-D/
  blend-A+D/            # if blend requested
  selected/             # symlink to winner → promoted to main tree
```

On selection, the winning candidate's files are copied to the main working tree and committed. Gallery artifacts are preserved in `.roadmap/gallery/` for audit.

### Convergence protocol

The gallery is the diversity mechanism, not the retry mechanism. Retrying the same generation with the same inputs doesn't improve confidence — it's not a slot machine. The failure modes and correct responses:

| Situation | Wrong response | Right response |
|---|---|---|
| Candidate scores 0.72, threshold 0.9 | Retry same strategy | Try a structurally different gallery candidate |
| All 4 candidates fail same intent | Generate candidate 5, 6, 7... | Stop. Surface structured evidence to human. |
| Fix pass doesn't improve confidence | Retry fix pass | Expand to a different approach or escalate |

When no candidate clears a gate, the system emits structured evidence and stops:

```json
{
  "unreachable": "dark: variants use .dark class selector, not @media prefers-color-scheme",
  "bestConfidence": 0.72,
  "threshold": 0.9,
  "candidates": 4,
  "diagnosis": "all candidates used @media prefers-color-scheme; none declared @custom-variant dark"
}
```

The human (or higher-tier orchestrator) decides: fix the spec, fix the intent statement, or provide a hint and re-run. The system does not decide.

Fix nodes also have a budget:

```typescript
convergence = {
  maxFixPasses: 3,    // per gate, not per intent — after 3, escalate
  escalateAfter: 'all-candidates-fail' | 'fix-pass-stall',
  escalateTo: 'human' | 'opus-review',
}
```

No loops. Gallery = diversity. Fix passes = correction. Escalation = exit. The system never retries the same operation — it either tries something structurally different or stops and says why.

### Post-selection: correction graph

The selected candidate (or blend) becomes the starting point for the correction graph (see FR-PLAN-GALLERY). Failed intent gates on the selected candidate become structured evidence for fix nodes — not vague symptoms but precise diagnosis:

```
emit --gallery → candidate B: intent confidence 0.15 on dark mode
  Judgment: {
    reasoning: "index.css imports tailwindcss but does not declare @custom-variant dark.
                Built CSS at dist/.../index.css:658 shows dark: variants wrapped in
                @media (prefers-color-scheme: dark), not .dark selector.",
    evidence: ["src/assets/index.css:1", "dist/renderer/assets/index-Cp0qfMFl.css:658"]
  }
```

The fix node receives this judgment as its brief — not "the app looks weird" but "line 1 of index.css is missing `@custom-variant dark`, evidence: built CSS line 658 uses media query." One-shot fix.

Gallery eliminates the category of bugs that ANY candidate solved. If B had correct dark mode but wrong CSV, and A had correct CSV but wrong dark mode — blend A+B solves both. Bugs survive to correction only if NO candidate solved them.

## Cost model

| Component | Cost | Notes |
|---|---|---|
| 4× Haiku emit | 4 × $0.30 = $1.20 | Parallel, same wall-clock as 1 |
| 4× deterministic gates | ~$0 | tsc + vitest + build, no LLM |
| Intent evaluation (survivors) | ~$0.50 | Scoped reads, structured judgment |
| Blend (if requested) | ~$0.20 | Targeted patches only |
| **Total** | **~$2.00** | |

Compare: iter 2 execution cost ~$37, iter 1 ~$46. Gallery is 95% cheaper because it eliminates the coordination overhead (N agents × M turns × context re-reads) and replaces it with N independent single-pass generations.

## emit-gallery as a node type

`emit --gallery` is not just a CLI command — it is a first-class DAG node type. Plan templates compose by declaring `emit-gallery` nodes:

```typescript
interface EmitGalleryNodeSpec {
  id: string
  type: 'emit-gallery'
  candidates: number                  // how many implementations to generate
  strategies: string[]                // ['faithful', 'minimal', 'robust', 'budget']
  selectionMode: 'auto' | 'manual'   // auto = LLM selects via Judgment, manual = user picks
  validate: ValidationRule[]          // gate suite applied to each candidate
  produces: string[]                  // files the selected/blended candidate must produce
  deps?: string[]
}
```

`roadmap complete <emit-gallery-node>` dispatches on `node.type`:
- `'execute'` (default) — existing behavior: validate artifacts, record
- `'emit-gallery'` — run gallery pipeline: generate candidates, gate each, select/blend, commit winning files, record judgment to `.roadmap/evaluations/emit-selection.jsonl`

Plan templates compose using these nodes directly:

```typescript
// "aggressive" template
nodes: [
  { id: 'emit', type: 'emit-gallery', candidates: 4,
    strategies: ['faithful', 'minimal', 'robust', 'budget'],
    selectionMode: 'auto', validate: [...] },
  { id: 'runtime-gate', deps: ['emit'], validate: [{ type: 'launch-check', ... }] },
  { id: 'converged', deps: ['runtime-gate'] },
]

// "staged" template
nodes: [
  { id: 'emit-skeleton', type: 'emit-gallery', candidates: 3,
    strategies: ['faithful', 'minimal', 'budget'],
    validate: [{ type: 'shell', command: 'npx tsc --noEmit' }] },
  { id: 'emit-features', type: 'emit-gallery', candidates: 3, deps: ['emit-skeleton'],
    validate: [{ type: 'shell', command: 'npx vitest run' }, ...intentRules] },
  { id: 'runtime-gate', deps: ['emit-features'], validate: [...] },
  { id: 'converged', deps: ['runtime-gate'] },
]
```

Expansion still works: if the selected candidate fails downstream gates, the fix node is a standard `execute` node. The gallery node closes when its selection is committed; downstream nodes execute normally.

## Runtime gate: CDP explore scripts

The runtime gate connects to the live Electron app via Chrome DevTools Protocol and produces structured observations — not screenshots for pixel interpretation. This adopts the explore → observe → judge pattern from [template-hmi](~/src/template-hmi/scripts/explore/).

### Architecture

```
dev-runner.ts launches Electron with --remote-debugging-port=9222
  → explore script connects via chromium.connectOverCDP()
    → performs interactions + DOM inspection
      → returns structured observations (not screenshots)
        → intent evaluator judges observations against spec statements
```

### Explore script per intent statement

Each spec acceptance scenario maps to an explore script that produces structured observations:

```typescript
// scripts/explore/validate-todo.ts
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9222')
const contexts = browser.contexts()
const page = contexts[0].pages().find(p => !p.url().includes('devtools'))

const observations: Record<string, unknown> = {}

// Intent: "Todo text visible in both themes"
const item = page.locator('.todo-item span').first()
observations.textColor = await item.evaluate(el => getComputedStyle(el).color)
observations.bgColor = await item.evaluate(el => {
  const parent = el.closest('[class*="bg-"]')
  return parent ? getComputedStyle(parent).backgroundColor : 'transparent'
})

// Intent: "Theme toggle exists and responds"
const toggle = page.locator('[title*="theme"], [title*="Theme"]')
observations.toggleVisible = await toggle.isVisible()
await toggle.click()
observations.darkClassAfterToggle = await page.evaluate(() =>
  document.documentElement.classList.contains('dark')
)

// Intent: "CRUD operations work"
await page.fill('input[placeholder]', 'Test todo')
await page.press('input[placeholder]', 'Enter')
observations.todoCount = await page.locator('.todo-item').count()
observations.todoText = await page.locator('.todo-item span').first().textContent()

await browser.close()
// → observations is structured JSON, fed to intent evaluator
```

### Why CDP, not screenshots

| CDP explore (structured) | scrot/xdotool (visual) |
|---|---|
| `getComputedStyle(el).color` → `"rgb(26, 26, 26)"` | 21 screenshots + magick crop + squint |
| `toggle.isVisible()` → `true` | "I think I see a button at the bottom" |
| `page.locator('.todo-item').count()` → `3` | "There appear to be checkboxes" |
| 1 tool call per assertion | 4 tool calls per visual check |
| Structured JSON → intent evaluator | Image → vision model → interpretation → guess |

The explore script runs in the runtime-gate node's `validate[]`:

```json
{
  "type": "shell",
  "command": "npx tsx scripts/explore/validate-todo.ts",
  "expectExitCode": 0
}
```

The script exits 0 if observations were collected, non-zero on crash/timeout. The observations file feeds the intent evaluator as evidence alongside the code context.

### Explore → Promote

Validated explore scripts promote to permanent E2E tests. The runtime gate observations become regression tests:

```
scripts/explore/validate-todo.ts  →  tests/e2e/todo-app.spec.ts
  (ephemeral, CDP-based)              (permanent, _electron.launch())
  observations → intent eval           assertions → vitest/playwright
```

The explore script uses `connectOverCDP()` (attaches to running app). The promoted test uses `_electron.launch()` (spawns its own app instance). Same interactions, different lifecycle.

### Prior art

The explore → observe → judge pattern is validated in production at [template-hmi](~/src/template-hmi):
- 21 explore scripts covering workspace composition, drag-reposition, quick layouts, status aggregation
- 42/42 E2E tests promoted from explore observations
- CDP connection via `--remote-debugging-port=9222` on Electron 34
- `scripts/dev-runner.ts` as the launch orchestrator

## Intent derivation: spec, not history

Intent statements derive from the **spec's acceptance scenarios**, not from failure history:

```
pre-spec.md says "dark/light via Tailwind class strategy"
  → intent statement: "dark: variants use .dark class selector"
  → explore script: checks getComputedStyle in both themes
  → compiled prompt: includes the intent + what wrong looks like

pre-spec.md says "CRUD with SQLite persistence"
  → intent statement: "todos persist across app restart"
  → explore script: creates todo, restarts app, checks todo exists
  → compiled prompt: includes the intent + persistence mechanism
```

The domain knowledge base tells the template system what concern classes a given tech stack implies ("Electron + native modules → externalization concern"). This is general engineering knowledge encoded as rules, not learned from this project's failures. A brand-new project with the same stack gets the same pre-expansion.

Failure history is used for **one thing only**: cost/time estimation in the plan gallery's Pareto filter. Not for intent derivation, not for threshold calibration, not for pre-expansion selection.

## Integration with plan gallery

`plan --gallery` selects the execution shape. `emit --gallery` is one of those shapes — specifically, it's what the "aggressive" and "budget" plan templates use internally via `emit-gallery` node type. The staged plan template uses two `emit-gallery` nodes (skeleton + features). The corrective template uses one `emit-gallery` node with pre-expanded fix nodes in the surrounding DAG.

```
plan --gallery → selects "aggressive" template
  └── aggressive template DAG contains: emit-gallery node → runtime-gate → converged
        └── roadmap complete emit → gallery pipeline runs
              └── correction DAG if runtime-gate fails
```

## Scope

- New: `src/lib/emit-gallery.ts` — candidate generation, parallel execution, scorecard aggregation, `fileToIntents` index builder
- New: `src/lib/blend.ts` — multi-candidate file merging with intent-gate resolution
- New: `src/lib/strategies/` — generation strategy definitions (faithful, minimal, robust, budget)
- Modify: `src/protocol.ts` — `EmitGalleryNodeSpec` type, `NodeSpec.type` discriminant, `complete` dispatch on `node.type`
- Modify: `bin/roadmap.ts` — `emit --gallery`, `--candidates`, `--select`, `--blend` flags; `complete` handler dispatches on node type
- New: `.roadmap/gallery/` directory structure for candidate working trees
- New: `src/lib/explore-runner.ts` — CDP explore script executor, observation collector, dev-runner orchestration
- New: `scripts/explore/` template — boilerplate explore script with CDP connection + observation output
- Modify: `src/lib/validate.ts` — batch validation across candidate trees, explore script integration in runtime gates
- Tests: parallel generation, scorecard aggregation, blend algorithm, gate-based conflict resolution, node-type dispatch in complete, CDP explore script execution

## Not in scope

- Custom generation strategies (future: user-defined strategy prompts)
- Cross-project candidate reuse (each project generates fresh)
- Incremental gallery (regenerate only failed candidates — future optimization)
- Gallery for non-repository artifacts (config-only, docs-only)
- Model selection per candidate (currently: strategy determines model)

## Open questions

1. **Gallery size**: 4 is diversity, not repetition — covers the strategy space (faithful/minimal/robust/budget). Configurable as a parameter, but the default should be fixed to the number of structurally distinct strategies, not arbitrary.
2. **Blend depth**: Current proposal blends at file granularity. Function-level blending would be more powerful but requires AST parsing. Worth it?
3. **Evaluation sharing**: If candidates share files (e.g., identical `tsconfig.json`), should intent evaluation be deduplicated? Saves cost but adds complexity.
4. **Failure recycling**: If a gallery candidate fails deterministic gates, should its passing files be available as blend donors? Or is a non-compiling candidate fully excluded?
5. **`fileToIntents` over-restriction**: When `contextPaths` is absent and the rule falls back to `node.produces`, the index includes all produced files for every intent statement — conservative but may over-restrict blending on large-produces nodes. Mitigate by requiring `contextPaths` on intent rules used in gallery nodes?
