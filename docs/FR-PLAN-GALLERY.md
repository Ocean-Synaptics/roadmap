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
| Pre-expansion | `none` / `from-spec-analysis` | Baseline size vs first-pass success rate |
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
    runtime: number             // count of launch-check/CDP explore gates
  }
  specSignal?: {
    detectedConcerns: string[]      // from spec analysis: "native-modules", "css-framework-dark-mode", "ipc-boundary"
    preExpanded: string[]           // nodes added to address detected concerns
    templateSuccessRate?: number    // how often this template shape converged (when history exists)
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
     Spec-detected: native-modules (Electron+SQLite), css-dark-mode (Tailwind 4), ipc-boundary

  C: staged          9 nodes   ~6 min   ~$4    risk: lowest
     emit-skeleton → compile → emit-features → test → intent → runtime → done

  D: budget          6 nodes   ~4 min   ~$0.80 risk: medium
     emit(haiku) → compile ─┬─ test ──┬─ runtime → done
                            └─ intent(opus) ┘

  Spec analysis: Electron+native-module, Tailwind 4 dark mode, IPC boundary
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
  "reasoning": "Spec declares Electron+SQLite+Tailwind 4 — pre-expansion covers known concern classes"
}]'
```

Selection is logged to `.roadmap/evaluations/plan-selection.jsonl` for audit. Cost/time actuals feed back into the cost estimator for future runs — but not into gate calibration or intent derivation.

### Template derivation

Templates are not hardcoded. They derive from:

1. **Spec analysis**: file count, module boundaries, IPC surface area, tech stack → determines template shape. "Electron + better-sqlite3" → native-module concern. "Tailwind 4 + dark mode" → CSS framework concern. These are **domain knowledge** applied to the spec, not lessons from prior failure.
2. **Domain knowledge base**: known concern classes for common tech stacks. The template system knows "Electron apps with native modules need electron-rebuild" the same way a senior engineer knows it — from general knowledge, not from this project's bug history.
3. **Checkpoint history** (cost/time only): `.roadmap/checkpoints/*.json` → node duration baselines for cost/time estimates. This is the only legitimate history use — calibrating wall-clock and cost predictions, not deciding what to validate or pre-expand.

Intent statements derive from the **spec's acceptance scenarios**, not from failure history. Pre-expansion derives from **spec analysis + domain knowledge**, not from "what went wrong last time." Confidence thresholds are **specification properties**, fixed by the spec author. An intent statement that consistently fails is evidence of a generator problem, not a threshold problem. The system does not learn to lower its own bar.

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
- Pre-expanded nodes carry `{ preExpanded: true, concern: "native-modules", source: "spec-analysis" }` provenance.
- Gallery metadata recorded in `.roadmap/gallery-selections.jsonl` for cost/time calibration only.

## Scope

- New: `src/lib/gallery.ts` — template parameterization, candidate generation, Pareto filtering
- New: `src/lib/gallery-templates/` — template definitions (aggressive, corrective, staged, budget)
- New: `src/lib/cost-estimator.ts` — token/time/cost estimation from checkpoint history (cost/time only, not gate calibration)
- New: `src/lib/spec-analyzer.ts` — spec → concern class detection (tech stack → known concern patterns)
- Modify: `bin/roadmap.ts` — `plan --gallery`, `--select`, `--evaluate` flags
- New: `.roadmap/gallery-selections.jsonl` — selection audit trail
- Tests: template generation, Pareto filtering, cost estimation, history integration

## Not in scope

- Custom template authoring (future: user-defined templates)
- Multi-project gallery (each project has its own history)
- Gallery for non-code DAGs (this is code-generation specific)
- Automatic selection without human/LLM judgment
