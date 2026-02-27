# FR: Plan gallery — execution graph selection from parameterized templates

## Problem

DAG construction is currently manual. The human or orchestrator designs a specific execution graph, commits it, executes it. If the shape is wrong — too serial, too parallel, missing pre-expansion — you discover this mid-execution when correction is expensive.

Iteration 1: 42-node construction DAG, 93 agents, 12% utilization. The graph shape was wrong (too wide, too shallow). Iteration 2: 28-node DAG, 20 agents, app builds but 3 runtime bugs. Better shape, but the serial gate chain (L0→L9) was unnecessary for a correction-graph model.

The right execution graph depends on project history, spec complexity, budget, and risk tolerance. These are known inputs. The space of valid DAGs for a given spec is enumerable from parameterized templates. Choosing between them is a judgment call — exactly what intent evaluation is designed for.

## Proposal

### `roadmap plan --gallery`

Generates 3-4 candidate execution DAGs from parameterized templates. Each candidate is a complete `head.json`-compatible structure with cost/time/risk estimates.

```bash
roadmap plan --gallery --from spec.md
roadmap plan --gallery --from tasks.md
roadmap plan --gallery --from .specify/specs/001-todo-app/
```

### Template parameters

| Dimension | Options | Trades |
|---|---|---|
| Emit strategy | `single-pass` / `two-stage` / `per-cluster` | Speed vs structural safety |
| Gate ordering | `parallel` / `serial` / `cheapest-first` | Time vs isolation |
| Pre-expansion | `none` / `from-history` / `from-spec-complexity` | Baseline size vs first-pass success rate |
| Model allocation | `opus-all` / `opus-emit+haiku-fix` / `haiku-emit+opus-judge` | Cost vs quality |
| Convergence | `fixed-passes(N)` / `until-clean` / `budget-capped($X)` | Predictability vs completeness |

### Gallery output

Structured JSON array. Each candidate:

```typescript
interface GalleryCandidate {
  id: string                    // e.g. "aggressive", "corrective", "staged", "budget"
  label: string                 // human-readable name
  summary: string               // one-line description
  parameters: TemplateParams    // which template options were selected
  dag: DAGSpec                  // complete head.json-compatible structure
  estimates: {
    nodes: number               // baseline node count (before expansion)
    maxExpansion: number         // worst-case node count if all gates fail once
    wallClockMinutes: number    // estimated from historical node durations
    costUSD: number             // estimated from model allocation + node count
    riskProfile: 'low' | 'medium' | 'high'
  }
  gateProfile: {
    deterministic: number       // count of tsc/vitest/build gates
    intent: number              // count of intent evaluation gates
    runtime: number             // count of launch-check/playwright gates
  }
  historySignal?: {
    priorFailureClasses: string[]   // known failure types from evaluations/*.jsonl
    preExpanded: string[]           // nodes added to prevent known failures
    templateSuccessRate: number     // how often this template shape succeeded historically
  }
}
```

### Gallery rendering

CLI renders a condensed comparison. ASCII table default, `--json` for machine consumption:

```
$ roadmap plan --gallery --from .specify/specs/001-todo-app/

  A: aggressive      6 nodes   ~3 min   ~$2    risk: high
     emit → compile ─┬─ test ──┬─ runtime → done
                     └─ intent ┘

  B: corrective      6+3 nodes ~5 min   ~$3    risk: low
     emit → compile → test → intent → runtime → done
     Pre-expanded: native-module-abi, css-dark-mode, ipc-channel-match

  C: staged          9 nodes   ~6 min   ~$4    risk: lowest
     emit-skeleton → compile → emit-features → test → intent → runtime → done

  D: budget          6 nodes   ~4 min   ~$0.80 risk: medium
     emit(haiku) → compile ─┬─ test ──┬─ runtime → done
                            └─ intent(opus) ┘

  History: 3 failures in 2 iterations (native-module, css-dark-mode, ipc-wiring)
  Recommendation: B (corrective)

  Select [A/B/C/D]:
```

### Selection protocol

Selection can be manual (user picks) or LLM-evaluated. The judgment schema is identical to intent gates:

```typescript
interface Judgment {
  statement: string     // what was evaluated
  confidence: number    // 0.0–1.0
  reasoning: string
  evidence?: string[]   // file:line refs
}
```

For `complete`, `statement` comes from the node's intent rule. For `plan --gallery`, the statement is implicit: `"this execution plan matches project context"`. Both write to `.roadmap/evaluations/` — the only difference is the `phase` field in the JSONL entry (`"complete:<node-id>"` vs `"plan-selection:<gallery-run-id>"`). The `head.json` commit is a side effect of a passing plan-selection judgment, not a separate operation.

```bash
# Manual
roadmap plan --gallery --select B

# LLM-evaluated (same Judgment schema as complete --evaluate)
roadmap plan --gallery --evaluate '[{
  "statement": "this execution plan matches project context",
  "confidence": 0.88,
  "reasoning": "3 prior failures in known categories — pre-expansion eliminates these"
}]'
```

Selection is logged to `.roadmap/evaluations/plan-selection.jsonl`. Future gallery runs weight toward historically-selected templates.

### Template derivation

Templates are not hardcoded. They derive from:

1. **Spec structure**: file count, module boundaries, IPC surface area → determines whether single-pass or staged emit is viable
2. **Evaluation history**: `.roadmap/evaluations/*.jsonl` → identifies failure classes for pre-expansion, provides failure mode hints (see FR-COMPILE-PROMPTS)
3. **Checkpoint history**: `.roadmap/checkpoints/*.json` → node duration baselines for cost/time estimates
4. **Trail history**: `.roadmap/trail.jsonl` → which template shapes reached convergence without manual intervention

History feeds strategy selection only: which templates to surface, what to pre-expand, how to order candidates in the gallery. History does NOT feed gate calibration — confidence thresholds are specification properties, fixed by the spec author. An intent statement that consistently fails is evidence of a generator problem, not a threshold problem.

### Pareto filtering

The full parameter space produces ~200 combinations. Most are dominated (slower AND more expensive AND riskier). Gallery prunes to the Pareto frontier along cost/time/risk. 3-4 candidates is the target — enough to offer real choice, few enough to compare at a glance.

Risk is cardinal, not ordinal:

```
risk = 1 - (historicalSuccessRate × gateConvergenceRate)
```

- `historicalSuccessRate` — fraction of prior runs with this template shape that reached converged without manual intervention (from `.roadmap/evaluations/plan-selection.jsonl` + checkpoint outcomes)
- `gateConvergenceRate` — fraction of gates that passed on first attempt historically (from `.roadmap/evaluations/*.jsonl`)

No history → `risk = 1.0`. After 3+ runs → cardinal value, Pareto-filterable. On first gallery run for a new project, the conservative template always survives to the output set (it dominates on risk when all templates share `risk = 1.0`).

## Integration

- `plan --gallery` outputs candidates. `plan --gallery --select X` commits the selected DAG as `head.json`.
- Selected DAG is a standard roadmap — all existing commands (`orient`, `complete`, `expand`, `propagate`) work unchanged.
- Pre-expanded nodes carry `{ preExpanded: true, failureClass: "native-module-abi" }` provenance.
- Gallery metadata recorded in `.roadmap/gallery-selections.jsonl` for future template weighting.

## Scope

- New: `src/lib/gallery.ts` — template parameterization, candidate generation, Pareto filtering
- New: `src/lib/gallery-templates/` — template definitions (aggressive, corrective, staged, budget)
- New: `src/lib/cost-estimator.ts` — token/time/cost estimation from history
- Modify: `bin/roadmap.ts` — `plan --gallery`, `--select`, `--evaluate` flags
- New: `.roadmap/gallery-selections.jsonl` — selection audit trail
- Tests: template generation, Pareto filtering, cost estimation, history integration

## Not in scope

- Custom template authoring (future: user-defined templates)
- Multi-project gallery (each project has its own history)
- Gallery for non-code DAGs (this is code-generation specific)
- Automatic selection without human/LLM judgment
