# FR: Constraint solver for `roadmap cluster`

## Problem

Union-find on the produces/consumes bipartite graph has two failure modes:

1. **No exclusion**: Hub files (shared/types.ts, package.json) create transitive edges that merge everything into one mega-cluster. todo-app: 17 of 24 nodes → 1 cluster.
2. **Hub exclusion**: Threshold is binary — a file either creates edges or doesn't. Threshold 3 fragments into 17 clusters (near 1:1 with nodes). Threshold 5 produces one 15-node cluster because `vitest.config.ts` (4 consumers) bridges test and implementation nodes.

No threshold value produces the natural 5-cluster decomposition visible in manual analysis. The problem is that union-find doesn't optimize — it finds connected components. Clustering is a partitioning problem, not a connectivity problem.

### Evidence

| Configuration | Clusters | Max parallel | Quality |
|---|---|---|---|
| No flags | 6 (1×17 + 5×1) | 6 | Mega-cluster defeats purpose |
| `--exclude-hubs 3` | 17 | 8 | Near 1:1, no coherence gain |
| `--exclude-hubs 5` | 8 (1×15 + 7×1) | 6 | Still one mega-cluster |
| `--max-size 5` | 9 | 6 | Arbitrary splits, not semantic |
| Manual (postmortem) | 5 | 4 | Natural data-flow clusters |

## Proposal

Replace union-find with weighted min-cut balanced partitioning.

### Model

Build a weighted node-pair affinity graph:
- For each artifact path that node A produces and node B consumes, add weight 1 to edge (A, B)
- For each artifact path that both A and B consume (shared input), add weight 0.5
- Ambient references add 0 weight (no clustering affinity)

### Objective

**Minimize**: total weight of cross-cluster edges (artifact cuts)

**Subject to**:
- Cluster size ≤ `--max-size` (default: unbounded)
- No cyclic dependencies between clusters (cluster DAG must be acyclic)
- Each node in exactly one cluster

**Secondary objective**: minimize cluster count (fewer agents = less coordination overhead). Tie-break: prefer fewer, larger clusters over many small ones.

### Algorithm

Kernighan-Lin (KL) or similar iterative bisection:
1. Start with all nodes in one cluster
2. Find the min-cut bisection (lightest edges to cut)
3. If either partition exceeds max-size, recurse
4. Stop when no partition improves the objective or all clusters are within size bounds
5. Verify acyclicity of resulting cluster dependency graph; if cyclic, merge the cycle

Alternative: spectral partitioning on the Laplacian of the affinity graph. Fiedler vector gives the optimal 2-way cut; recursive application gives k-way.

For DAGs under 100 nodes (typical roadmap scale), KL is fast enough. No need for approximate methods.

### Expected output for todo-app

With max-size 6, the solver should find:

| Cluster | Nodes | Rationale |
|---|---|---|
| Foundation | shared-types, config-test, config-ui, config-build, config-lint, config-tsconfig | All consume package.json, produce configs. 0 cross-cluster cuts within. |
| Electron | electron-db, electron-preload, electron-main | Chain: types → db → main. 2 internal artifact edges, 1 external (shared/types.ts). |
| Renderer | renderer-store, renderer-entry, renderer-utils | Chain: store → entry. Internal data flow through todoStore.ts. |
| Components | component-todolist, component-todoitem, component-titlebar, component-themetoggle | All consume renderer-entry artifacts. Parallel leaf nodes. |
| Tests | test-db, test-store, test-components, test-csv, feature-csv-export | All consume vitest.config.ts + implementation artifacts. Parallel leaf nodes. |

Cross-cluster cuts: shared/types.ts (hub, ~6 cuts), vitest.config.ts (~4 cuts), todoStore.ts (~2 cuts). Total ~12 cuts vs ~0 intra-cluster cuts. This is the min-cut solution.

### Interface

```
roadmap cluster --solver          # use constraint solver instead of union-find
roadmap cluster --solver --max-size 6
```

Output: same `ClusterResult` shape. Add `solver: 'min-cut' | 'union-find'` field and `cutWeight: number` (total cross-cluster edge weight — lower is better).

### Composition

- `--solver` replaces `--exclude-hubs` (solver handles hub files naturally by cutting through high-fanout edges)
- `--max-size` becomes a hard constraint in the solver, not a post-hoc split
- `parallel --by-cluster` and `orient --assign --by-cluster` work unchanged — they consume ClusterResult regardless of solver

## Scope

- New: `src/lib/cluster-solver.ts` — affinity graph construction + KL bisection
- Modify: `src/lib/cluster.ts` — dispatch to solver or union-find based on flag
- Modify: `bin/roadmap.ts` — `--solver` flag
- Tests: known-optimal cases (chain, star, bipartite), max-size enforcement, acyclicity guarantee, determinism
- Keep union-find as default (backward compat). Solver is opt-in via `--solver`.

## Not in scope

- Multi-objective optimization (wall-clock prediction, agent cost modeling)
- Dynamic re-clustering during execution
- Cross-repo clustering
