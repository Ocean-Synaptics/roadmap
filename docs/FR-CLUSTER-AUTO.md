# FR: `roadmap cluster --auto` — parameter sweep for optimal clustering

## Problem

Clustering requires manual tuning of `--exclude-hubs` threshold and `--max-size`. The search space is small but the interaction loop is slow — human runs command, inspects output, adjusts parameters, repeats. Each combination produces a different partition with different trade-offs.

Current session required 6 manual attempts to explore the space:

| Attempt | Flags | Result |
|---|---|---|
| No flags | — | 1 mega-cluster (17 nodes) |
| `--max-size 5` | — | 9 clusters, arbitrary splits |
| `--exclude-hubs` | threshold 3 | 17 clusters (fragmented) |
| `--exclude-hubs 5` | threshold 5 | 8 clusters, 1×15 mega |
| `--solver` | — | 1 cluster (package.json hub) |
| `--solver --exclude-hubs` | — | 1 cluster (solver ignores hubs) |

None produced the known-optimal 5-cluster partition. The answer exists in the parameter space — the CLI should find it.

## Proposal

### `roadmap cluster --auto`

Exhaustive sweep over hub threshold × max-size combinations. Score each configuration. Return the Pareto frontier ranked by composite score.

### Search space

- **Hub threshold**: 2 to max_consumers (typically 2–10). Plus "no exclusion" as baseline.
- **Max-size**: 3 to ⌊N/2⌋ (N = node count). Plus "unbounded" as baseline.
- **Solver**: each combination tried with both union-find and min-cut solver (if `--solver` is available).

For a 24-node DAG with max consumer count 7: ~6 thresholds × ~10 sizes × 2 methods = ~120 configurations. Union-find on 24 nodes is <0.1ms. Total sweep: <15ms.

### Scoring

Two objectives (lower is better for cuts, higher is better for parallelism):

- **Parallelism**: `clusterCount` (more clusters = more agents = faster)
- **Coherence**: `1 - (cutWeight / totalEdgeWeight)` (fewer cross-cluster cuts = fewer integration bugs)

Composite score: `clusterCount × coherence`. Rewards configurations that maximize parallelism while minimizing cuts.

Tie-breaking:
1. Higher parallelism (prefer more clusters)
2. Lower max cluster size (prefer even distribution)
3. Lower hub threshold (prefer less exclusion)

### Output

```json
{
  "sweep": {
    "configurations": 120,
    "paretoFrontier": 5,
    "elapsedMs": 12
  },
  "ranked": [
    {
      "rank": 1,
      "hubThreshold": 5,
      "maxSize": 6,
      "solver": "union-find",
      "clusterCount": 5,
      "maxParallelClusters": 4,
      "cutWeight": 4.0,
      "coherence": 0.85,
      "score": 4.25,
      "clusters": [...]
    },
    {
      "rank": 2,
      ...
    }
  ],
  "selected": {
    "index": 0,
    "reason": "highest composite score on Pareto frontier"
  }
}
```

Default: auto-selects rank 1. `--auto=N` selects rank N. `--auto --dry-run` shows the frontier without selecting.

### Integration

- `parallel --by-cluster --auto` — uses auto-selected clustering for pipeline waves
- `orient --assign --by-cluster --auto` — uses auto-selected clustering for agent dispatch
- `compile-prompts` uses auto-selected clustering for domain resolution

### Invariants

- Deterministic: same DAG → same sweep → same ranking → same selection
- All Pareto-frontier configurations are valid (acyclic cluster DAG, exclusive ownership)
- `--auto` composes with `--solver` (restricts sweep to solver method only)
- Dominated configurations are excluded from output (not just low-ranked)

## Scope

- New: `src/lib/cluster-auto.ts` — sweep loop, scoring, Pareto frontier extraction
- Modify: `src/lib/cluster.ts` — expose `buildClusters` options for programmatic sweep
- Modify: `bin/roadmap.ts` — `--auto` flag, ranked output formatting
- Tests: Pareto correctness, determinism, scoring edge cases (all-singleton vs all-merged), composition with `--solver`
