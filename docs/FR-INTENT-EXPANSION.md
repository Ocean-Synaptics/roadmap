# FR: Intent-driven expansion — intent gate failures trigger recursive subphase decomposition

## Problem

Intent gates and expansion are orthogonal systems. Intent gates evaluate behavioral properties of artifacts (`confidence >= threshold`). Expansion decomposes plan nodes into child subgraphs. Nothing connects them.

When an intent gate fails today, `complete` returns a `ValidationResult` with the failing statement, confidence, and reasoning. The agent reads this, manually fixes the code, and retries `complete` on the same node. The node boundary is fixed — if the node was scoped wrong (too broad, wrong decomposition, missing a concern), the agent patches inside a container that doesn't fit the problem. The failure mode:

| Situation | What happens today | What should happen |
|---|---|---|
| Intent confidence 0.72, threshold 0.9 | Agent retries same approach, maybe gets 0.75 | Node expands into targeted fix subgraph |
| Two intent statements fail on same node | Agent tries to fix both at once, may break one fixing the other | Each failing statement becomes its own fix node |
| Fix requires architectural change | Agent hacks around it within the node's produces boundary | Expansion widens the produces scope with new nodes |
| Same intent fails 3 times | Agent spirals, context fills up | Escalation — system stops and surfaces structured evidence |

The expansion mechanism already supports recursive decomposition (plan→plan→execute chains, `expandedFrom` provenance, harness loop). The gallery system already produces structured diagnosis (`GalleryFailure.diagnosis`). The missing piece is the trigger: intent failure → expansion.

## Proposal

### Intent-driven expansion loop

When `roadmap complete <node>` evaluates intent gates and one or more fail, the system generates an expansion proposal instead of simply reporting failure.

```
complete <node> --evaluate '[...]'
  → intent gate fails (confidence < threshold)
  → system generates expansion-proposal from structured diagnosis
  → expansion creates child fix nodes (one per failing statement)
  → fix nodes execute
  → parent node re-validates all intent gates
  → still failing? decompose again (recursive)
  → all pass? parent closes, DAG advances
```

### New ValidationRule behavior: `expandOnFail`

```typescript
interface IntentRule {
  type: 'intent'
  statement: string
  confidence: number
  evaluator: 'self' | 'council'
  context?: string[]
  expandOnFail?: boolean        // NEW: trigger expansion instead of bare rejection
  maxExpansionDepth?: number    // NEW: recursion limit (default: 3)
  explore?: string              // NEW: runtime-explore script path (CDP-based visual validation)
}
```

When `expandOnFail: true` and confidence < threshold:

1. `complete` returns `{ status: 'expanding', failingIntents: [...] }` instead of `{ status: 'failed' }`
2. For each failing intent, the system generates a fix node:

```typescript
interface FixNode {
  id: string                          // `${parentId}-fix-${intentIndex}`
  desc: string                        // generated from diagnosis
  expandedFrom: string                // parent node ID
  produces: string[]                  // inherited from parent (scoped to failing context)
  consumes: string[]                  // parent's produces (reads current state)
  validate: ValidationRule[]          // the single failing intent rule + deterministic gates
  _intentDiagnosis: {                 // provenance — what triggered this expansion
    statement: string
    achievedConfidence: number
    threshold: number
    reasoning: string
    evidence: string[]
    expansionDepth: number            // 0 = first expansion, 1 = expansion of expansion, ...
  }
}
```

3. Fix nodes are committed to the DAG via `roadmap expand` (same mechanism as plan node expansion)
4. Parent node gains `{ type: 'expanded', minNodes: N }` validation — closes when children close
5. Children execute, each targeting one failing statement
6. When all children close, parent re-validates original intent gates against the now-modified artifacts
7. If intents still fail and `expansionDepth < maxExpansionDepth`: recurse (child becomes parent, generates grandchildren)
8. If `expansionDepth >= maxExpansionDepth`: escalate — structured evidence to human, no further expansion

### Expansion script generation

The expansion is mechanical — no LLM needed to decide *what* to expand, only to *execute* the fix. The expansion script is derived from the failing intents:

```typescript
function generateIntentExpansion(
  parentNode: NodeSpec,
  failures: IntentFailure[],
  depth: number
): ExpansionScript {
  return {
    nodes: failures.map((f, i) => ({
      id: `${parentNode.id}-fix-${i}`,
      desc: `Fix: ${f.statement} (confidence ${f.achieved}/${f.threshold})`,
      expandedFrom: parentNode.id,
      produces: resolveProduces(parentNode, f),   // parent's produces filtered to f.context
      consumes: parentNode.produces,               // read current artifacts
      ambient: parentNode.ambient,
      validate: [
        // The failing intent — this is the acceptance test
        { type: 'intent', statement: f.statement, confidence: f.threshold,
          evaluator: 'self', expandOnFail: depth + 1 < (parentNode.maxExpansionDepth ?? 3) },
        // Plus deterministic gates from parent — don't break what works
        ...parentNode.validate.filter(r => r.type !== 'intent'),
      ],
      _intentDiagnosis: {
        statement: f.statement,
        achievedConfidence: f.achieved,
        threshold: f.threshold,
        reasoning: f.reasoning,
        evidence: f.evidence,
        expansionDepth: depth + 1,
      },
    })),
  }
}
```

`resolveProduces` scopes fix node ownership: if the intent rule has `context` paths, those are the fix node's produces. If not, falls back to parent's full produces list. This keeps fix nodes targeted — a dark-mode intent failure doesn't give the fix node permission to rewrite the database layer.

### Convergence guarantees

The loop must terminate. Three mechanisms:

1. **Depth limit**: `maxExpansionDepth` (default 3). After 3 levels of recursive expansion, the system escalates instead of expanding further. Evidence from iterations 1-2: the bugs that required architectural changes (CSS strategy, native module bundling) were fixable in 1-2 targeted edits. 3 levels is generous.

2. **Stall detection**: If expansion depth N achieves the same or lower confidence as depth N-1 on the same statement, the fix is not converging. Escalate immediately — don't burn another level.

3. **Budget cap**: Optional `maxExpansionCost` on the parent node. Expansion stops when cumulative child node cost exceeds the cap. Cost estimated from `cost-estimator.ts` historical data.

```typescript
interface ConvergenceLimits {
  maxExpansionDepth: number       // hard recursion limit (default: 3)
  stallThreshold: number          // min confidence improvement per level (default: 0.05)
  maxExpansionCost?: number       // USD budget cap (optional)
}
```

Escalation output:

```json
{
  "status": "escalated",
  "node": "component-themetoggle",
  "statement": "dark: variants use .dark class selector, not @media prefers-color-scheme",
  "history": [
    { "depth": 0, "confidence": 0.72 },
    { "depth": 1, "confidence": 0.74 },
    { "depth": 2, "confidence": 0.74 }
  ],
  "diagnosis": "All fix attempts modified index.css but none added @custom-variant dark declaration. The Tailwind 4 migration path is not in the model's training data.",
  "action": "Human intervention required — provide the @custom-variant dark syntax or pin Tailwind 3"
}
```

### Integration with gallery

Gallery provides the initial candidates. Intent-driven expansion provides the correction graph. They compose:

```
gallery: 4 candidates → gate → select best (maybe blend)
  → selected candidate has 2 failing intents
  → expansion: 2 fix nodes generated from diagnosis
  → fix nodes execute (targeted, scoped to failing statements)
  → parent re-validates → passes
  → DAG advances
```

Without this FR, gallery candidates that partially fail get discarded or manually patched. With it, the best candidate (even if imperfect) becomes the seed for automated correction. Gallery eliminates bugs that *any* candidate solved. Expansion fixes bugs that *no* candidate solved.

## Terminal intent gate invariant

### The rule

**Every roadmap must have at least one intent gate with `expandOnFail: true` on its terminal node.**

This is enforced by the CLI at DAG creation/modification time. If a roadmap's terminal node (the node with no dependents) has no intent validation with `expandOnFail`, the operation is rejected:

```bash
$ roadmap expand scripts/my-dag.ts --note "initial DAG"
Error: Terminal node 'integration-validated' has no intent gate with expandOnFail: true.
       A roadmap without intent-gated termination can close without behavioral validation.
       Add at minimum:
         { "type": "intent", "statement": "<what done looks like>",
           "confidence": 0.9, "evaluator": "self", "expandOnFail": true }
```

### Why this matters

Without this invariant, a roadmap can converge by passing only deterministic gates — tsc clean, tests pass, build succeeds. Iterations 1 and 2 both converged this way. Both had runtime bugs that deterministic gates couldn't catch.

The terminal intent gate is the "does this actually work?" check that the DAG cannot skip. Because `expandOnFail: true` triggers recursive decomposition on failure, the DAG literally cannot close until the intent passes. The system keeps refining until convergence or escalation — there is no path where a broken artifact slides through to "done."

```
Without terminal intent gate:
  DAG → deterministic gates pass → complete → "done" (maybe broken)

With terminal intent gate:
  DAG → deterministic gates pass → intent gate fails → expand → fix → re-validate
      → intent gate passes → complete → "done" (verified)
      → OR: escalation limit → human decides → explicit override or fix
```

The override path exists (`--skip-validate`) but requires explicit human instruction and records an audit trail. The default path — the one every agent follows without thinking — is intent-gated termination with recursive expansion.

### Enforcement

```typescript
// In validateDAG() — called by expand, import, and manual head.json writes
function validateTerminalIntentGate(dag: DAGSpec): ValidationError | null {
  const terminals = findTerminalNodes(dag)  // nodes with no dependents
  for (const term of terminals) {
    const hasIntentGate = term.validate?.some(
      r => r.type === 'intent' && r.expandOnFail === true
    )
    if (!hasIntentGate) {
      return {
        type: 'missing-terminal-intent',
        node: term.id,
        message: `Terminal node '${term.id}' requires at least one intent rule with expandOnFail: true`,
        fix: 'Add an intent gate that describes what "done" looks like for this roadmap'
      }
    }
  }
  return null
}
```

Called from:
- `roadmap expand` — rejects expansion scripts that produce DAGs without terminal intent gates
- `roadmap import` — rejects imported DAGs without terminal intent gates
- `roadmap validate` — reports as a structural validation error
- `roadmap propagate` — propagation doesn't remove intent gates (only adds `artifact-exists`)

### What the terminal intent statement looks like

The statement is project-specific but follows a pattern:

```json
// For a UI application — visual intent (runtime-explore backed):
{ "type": "intent", "statement": "Application launches, renders correctly in both themes, all CRUD operations functional, data persists across restart",
  "confidence": 0.9, "evaluator": "self", "expandOnFail": true, "maxExpansionDepth": 3,
  "explore": "scripts/explore/validate-app.ts" }

// For a library:
{ "type": "intent", "statement": "Public API matches spec, all documented examples execute correctly, no type errors in consumer code",
  "confidence": 0.9, "evaluator": "self", "expandOnFail": true, "maxExpansionDepth": 2 }

// For infrastructure:
{ "type": "intent", "statement": "Service starts, health check returns 200, load test sustains 100 rps at p99 < 200ms",
  "confidence": 0.95, "evaluator": "self", "expandOnFail": true, "maxExpansionDepth": 3 }
```

The statement answers: "if I showed this to the person who asked for it, would they say it's done?" The confidence threshold is how sure the evaluator must be. `expandOnFail` means the system keeps working until that threshold is met or it proves it can't.

### Visual intent gates (runtime-explore integration)

Terminal intent gates are not limited to code-reading evaluation. For projects producing runnable artifacts (UI apps, services, CLIs), the terminal intent should be **visual** — backed by a runtime-explore script (FR-RUNTIME-EXPLORE) that produces structured observations from the live application via CDP.

```typescript
interface IntentRule {
  type: 'intent'
  statement: string
  confidence: number
  evaluator: 'self' | 'council'
  expandOnFail?: boolean
  maxExpansionDepth?: number
  explore?: string              // path to runtime-explore script (CDP-based)
}
```

When `explore` is set, the intent evaluation pipeline changes:

```
Without explore (code-based):
  evaluator reads source files → judges statement → confidence

With explore (visual):
  1. Launch app (inferred from package.json or explicit launch command)
  2. Run explore script → structured observations (DOM state, computed styles, element visibility, interaction results)
  3. Evaluator reads observations + source files → judges statement → confidence
```

The explore script's observations become **evidence** for the intent judgment. Instead of the evaluator guessing whether dark mode works by reading CSS source, it sees `{ textColor: "rgb(229, 229, 229)", bgColor: "rgb(26, 26, 26)", darkClassPresent: true }` from the running app.

This is what closes the gap that broke iterations 1 and 2. The three runtime bugs (ABI mismatch, white-on-white text, invisible toggle) would all fail a visual intent gate backed by an explore script — the observations would show: app didn't launch (ABI crash), text invisible (contrast ratio 1:1), toggle not visible (`isVisible() → false`).

**Visual intents compose with expansion:**

```
terminal intent (visual, expandOnFail: true)
  → explore script runs → observations: toggle not visible
  → intent evaluator: confidence 0.4 (threshold 0.9)
  → expansion: fix node "fix toggle visibility"
    → _intentDiagnosis includes observations as evidence
    → fix node has full CDP observation context, not just "it looks wrong"
  → fix node executes (targeted CSS/layout change)
  → parent re-validates → explore script re-runs → observations: toggle visible
  → confidence 0.95 → passes → DAG closes
```

The explore script is the eyes. The intent evaluator is the judgment. Expansion is the hands. Together they form a closed perception-judgment-action loop that runs until the app actually works — not until the code looks right.

### `roadmap init` and terminal intent

When creating a new roadmap, `roadmap init` (or the equivalent first `expand`) should prompt for the terminal intent statement. This becomes the acceptance criterion for the entire DAG:

```bash
$ roadmap expand scripts/init.ts --note "new project"
No terminal intent gate found. What does "done" look like for this roadmap?
> Application launches with all features from spec, no visual defects, tests pass

Added to terminal node 'term':
  { "type": "intent", "statement": "Application launches with all features from spec, no visual defects, tests pass",
    "confidence": 0.9, "evaluator": "self", "expandOnFail": true }
```

## Complete flow

```
1. DAG created with terminal intent gate (enforced)
2. Agents execute nodes, complete with deterministic + intent validation
3. Interior nodes: intent failures → agent fixes within node (standard retry)
4. Interior nodes with expandOnFail: intent failure → expansion → fix subgraph
5. Terminal node: intent gate evaluates the whole deliverable
6. Terminal passes → DAG converges → done
7. Terminal fails → expansion → fix nodes targeting failing statements
8. Fix nodes execute → terminal re-validates
9. Still failing? Recursive expansion (depth-limited)
10. Depth exceeded or stalled? Escalation with structured evidence
11. Human provides hint or overrides → resume or close
```

The DAG is a self-refining plan. It starts with the best guess at decomposition. Intent gates catch what deterministic gates miss. Expansion decomposes failures into fixable pieces. The terminal invariant guarantees no roadmap closes without behavioral validation. The system keeps adding phases until it looks right — or until it proves it can't and asks for help.

## Scope

- Modify: `src/protocol.ts` — `expandOnFail`, `maxExpansionDepth`, `explore` on intent rules, `ConvergenceLimits` type
- New: `src/lib/intent-expansion.ts` — `generateIntentExpansion()`, `resolveProduces()`, stall detection
- Modify: `src/lib/validate.ts` (or `protocol.ts` `validateNode`) — `expandOnFail` triggers expansion instead of bare rejection
- Modify: `bin/roadmap.ts` `cmdComplete` — handle `{ status: 'expanding' }` result, auto-invoke expand
- Modify: `bin/roadmap.ts` `cmdExpand` — validate terminal intent gate invariant
- Modify: `bin/roadmap.ts` `cmdImport` — validate terminal intent gate invariant
- New: `src/lib/validate-dag.ts` — `validateTerminalIntentGate()`, called from expand/import/validate
- Tests: expansion generation from failing intents, depth limiting, stall detection, terminal invariant enforcement, recursive expansion chains, escalation output

## Not in scope

- Automatic expansion script generation from diagnosis (expansion is mechanical/template-based, not LLM-generated)
- Cross-node intent expansion (intent on node A fails, expansion creates node B — future, complex ownership)
- Intent threshold auto-calibration (thresholds come from spec, not from history)
- Explore script auto-generation (the script itself is authored, not generated — FR-RUNTIME-EXPLORE covers script conventions)

## Invariants

- Terminal intent gate is mandatory. No DAG closes without behavioral validation.
- Expansion is deterministic: same failing intents → same fix nodes. No LLM in the expansion decision.
- Depth limit is hard. System escalates, never loops indefinitely.
- Stall detection is immediate. Same confidence twice → stop, don't burn a third level.
- `--skip-validate` is the only override. Requires human instruction, records audit trail.
- Fix nodes inherit parent's deterministic gates. Expanding for an intent failure must not regress deterministic correctness.
- `expandOnFail` is opt-in per intent rule, mandatory on terminal nodes. Interior nodes can choose bare rejection (default) or expansion.

---

## Amendment: Bookend Intent Gates — Plan Clarity + Output Correctness

**Symmetry principle:** Every roadmap should be bracketed by two intent gates using the same expansion mechanism.

### Init Intent Gate (Plan Clarity)

**Location:** First node after `init`. Before execution begins.

**Statement:** "Plan is unambiguous and executable"
```
"Every node has:
  - Concrete produces (file paths, not placeholders)
  - Resolvable consumes (all referenced artifacts produced by predecessors)
  - Testable validate rules (not 'looks good', but measurable criteria)
  - Clear scope (node description fits one concern; no 'and', no 'also')"
```

**Confidence threshold:** 0.95 (high bar — plan must be crystal clear)

**Evaluator:** `self` (LLM reads node specs, checks structure + contracts)

**expandOnFail:** `true` (mandatory)

**On failure:** Expansion creates child nodes addressing each gap:
- Vague `produces` → split into concrete file paths
- Missing `consumes` → backtrack to find producer or flag as spec gap
- No `validate` rules → add validators or escalate as design question
- Overlapping ownership → reassign produces across nodes
- Too-broad scope → decompose into parallel children

**Recursion:** Typically 1-2 levels. If init gate requires 3+ expansions, the spec is malformed — escalate.

### Terminal Intent Gate (Output Correctness)

**Location:** Last node before `term`. After all work completes.

**Statement:** "Application works — visual validation passes"
```
"The built/deployed artifact satisfies all acceptance criteria when observed
 at runtime (explore scripts pass, no visual defects, all features functional)"
```

**Confidence threshold:** 0.90 (high bar — users see this)

**Evaluator:** `self` (LLM reads explore observations + test results)

**explore:** Required. Path to runtime validation script (Playwright + CDP).

**expandOnFail:** `true` (mandatory)

**On failure:** Expansion creates fix nodes from explore observations:
- White-on-white contrast detected → fix node for CSS
- Button invisible in dark mode → fix node for theme selector
- Form submits but data lost → fix node for persistence layer
- etc.

**Recursion:** Typically 1-3 levels. After 3 levels of expand-fix-re-validate, if still failing, escalate with full diagnostic.

### What Init Gate Catches

| Failure Mode | Before (No Init Gate) | With Init Gate |
|---|---|---|
| `produces: ["database"]` (no path) | Agent guesses `src/db.ts`, wrong format | Expansion forces: `src/lib/postgres.ts`, validates schema |
| Circular dependency: A consumes B, B consumes A | Discovered at execution, blocks swarm | Expansion detects + resolves before work starts |
| Two nodes both `produces: ["src/app.ts"]` | Runtime conflict, merge disaster | Expansion reassigns: one→index.ts, one→bootstrap.ts |
| Node has no validate rules | Untestable, nobody knows if it worked | Expansion adds: shell validator, test rule, or marks gap |
| Node description: "build and deploy and monitor and alert" | Scope creep, agent confused about goals | Expansion splits into 4 parallel nodes with single concerns |

### Symmetry

```
┌─────────────────────────────────────────┐
│ Init Intent Gate                        │
│ "Is this plan clear?"                   │
│ expandOnFail: true                      │
│ → Expansion refines plan until unambiguous
└──────────────────┬──────────────────────┘
                   │
                   ▼
         [Execute nodes — deterministic + interior intent gates]
                   │
┌──────────────────┴──────────────────────┐
│ Terminal Intent Gate                    │
│ "Does it work?"                         │
│ expandOnFail: true                      │
│ → Expansion refines output until correct
└─────────────────────────────────────────┘
```

Both gates use the same mechanism: intent evaluation + recursive expansion. No execution without a clear plan. No convergence without correct output.

### validateDAG() Invariant (Updated)

Every roadmap must satisfy:
1. ✅ Acyclic DAG (existing check)
2. ✅ Reachable from init to term (existing check)
3. ✅ Terminal node has intent rule with `expandOnFail: true` (existing, added in terminal-intent-gate-enforcement)
4. **NEW:** Init node (or first execute node after init) has intent rule with `expandOnFail: true`

Bypass: `--skip-validate <reason>` with audit trail (existing).

### Scope Addition (Implementation)

**New node type trigger:** Detect when a DAG is first created or imported without an init gate.
- `roadmap create` with interactive prompt: "Add plan clarity gate? (y/n)"
- `roadmap import` with warning: "No init gate detected. Add with: roadmap init <dag-id>"
- `cmdExpand` validates both gates present before committing

**New command (optional future):**
```bash
roadmap init <dag-id> --statement "custom clarity statement" --threshold 0.95
```

Adds an init gate node to an existing DAG.

### Example: iter3 Payload

**Init gate:**
```json
{
  "id": "plan-clarity",
  "desc": "Validate plan clarity before execution",
  "mode": "plan",
  "produces": [],
  "consumes": [],
  "deps": ["init"],
  "validate": [
    {
      "type": "intent",
      "statement": "Every node has concrete produces, resolvable consumes, testable validate rules, clear scope",
      "confidence": 0.95,
      "evaluator": "self",
      "expandOnFail": true,
      "maxExpansionDepth": 2,
      "context": [
        "src/spec.md — domain model",
        ".roadmap/head.json — current DAG"
      ]
    }
  ],
  "idempotent": true
}
```

**Terminal gate** (already in use):
```json
{
  "id": "term",
  "desc": "Verify application works end-to-end",
  "produces": [],
  "consumes": ["dist/app"],
  "deps": ["build", "deploy"],
  "validate": [
    {
      "type": "intent",
      "statement": "Application launches, renders all spec features, passes visual validation in light/dark modes",
      "confidence": 0.90,
      "evaluator": "self",
      "expandOnFail": true,
      "maxExpansionDepth": 3,
      "explore": "scripts/explore-app-correctness.ts",
      "context": [
        "spec.md — acceptance criteria",
        "scripts/explore-app-correctness.ts — visual contract"
      ]
    }
  ],
  "idempotent": true
}
```

### Why This Matters

**Zero-question execution (from CLAUDE.md):** "The node is defined clearly enough that an agent can execute it without asking for clarification."

Today, this is prose guidance. Agents *try* to follow it. With bookend gates:
- **Init gate enforces it mechanically.** The DAG literally cannot enter execution until the evaluator confirms clarity. No ambiguity passes the gate.
- **Terminal gate closes the loop.** Output isn't "done" when code compiles; it's done when the live app passes visual validation.

The DAG is now a **closed-loop refinement system**: clear plans → correct output.
