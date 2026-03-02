# Roadmap DAG Auto-Consolidation Design

## Overview

This document outlines the design for transparent auto-merging of multiple roadmap DAG files into a unified graph. The system eliminates manual DAG switching, provides integrated parallel visibility, and optimizes token usage through intelligent lazy-loading.

## Problem & Solution

### Current Pain Points
- **Manual switching**: Users manually copy `.roadmap/typescript-cleanup-001.json` over `head.json` when context switches needed
- **Stale pointers**: `baseSha` in `head.json` drifts from actual git HEAD
- **No integrated view**: Multiple independent DAGs are opaque to each other; can't see what blocks what
- **Token waste**: LLM reads all 50 nodes; only needs current batch (~2-3 nodes)
- **No orchestration**: Can't coordinate work across multiple tracks

### Design Solution
**Auto-merge on every query**: All `.roadmap/*.json` files are discovered, loaded, merged, and validated transparently on every CLI invocation. The user experiences a single unified DAG.

## Architecture

### 1. Discovery & Loading

**Components**:
- `consolidation/discover.ts`: Scan `.roadmap/` directory for `*.json` files
- `consolidation/loader.ts`: Parse each file into `Graph<string>` objects
- Validation: Ensure each file conforms to roadmap schema before merging

**Flow**:
```
scan .roadmap/*.json
  ↓
filter: match DAG schema (id, desc, init, term, nodes)
  ↓
load each into Graph<string>
  ↓
verify no cycles within each DAG
```

**Implementation Strategy**:
- Exclude files: `head.json` (result), `head-index.json` (metadata), temporary files
- Load in deterministic order (sorted by filename) for reproducibility
- Detect DAG files: presence of `{ id, desc, init, term, nodes }` shape

### 2. Multi-DAG Merge Logic

**Components**:
- `consolidation/merge.ts`: Implements `mergeMultiWay(graphs: Graph<string>[]): Graph<string>`
- Connection detection: Auto-identify where one DAG's output feeds another's input

**Merge Algorithm**:
```
1. Collect all graphs
2. For each graph pair (A, B):
   - Check if A.term.produces overlaps with B.init.consumes
   - OR check for explicit nextDAG metadata
   - If match: create dependency edge from A.term → B.init
3. Add inter-DAG edges to consolidated node map
4. Run topo sort on merged graph
5. Validate: cycles, disconnected nodes, missing deps
6. Return single unified Graph<string>
```

**Key Decisions**:
- **Phase boundaries**: Treat each source DAG as a logical phase (typescript-cleanup, dispatch-system, etc.)
- **Edge creation**: If A.term.produces=[file X] and B.init.consumes=[file X], auto-connect
- **Metadata**: Preserve original node IDs; track source DAG via `_sourceDAG` field
- **Idempotence**: Merging same set of files always produces identical result

**Example**:
```
typescript-cleanup-001.json:
  nodes: { fix-completion-enforcer-types, ..., typescript-validation-complete }

dispatch-system-001.json:
  nodes: { dispatch-init, ..., dispatch-system-complete }

After merge:
  - Edge: typescript-validation-complete → dispatch-init
  - Single graph with 15 nodes
  - Topo order respects dependency
```

### 3. Metadata Index Extraction

**Components**:
- `consolidation/index.ts`: Extract lightweight metadata from merged DAG
- Output: `.roadmap/head-index.json` (~10KB)

**Index Schema**:
```typescript
interface ConsolidationIndex {
  merged: true;
  timestamp: string;
  sourceFiles: string[];  // ["typescript-cleanup-001.json", "dispatch-system-001.json"]
  baseSha: string;
  nodes: {
    id: string;
    phase: string;  // derived from source file or metadata
    level: number;  // computed via topo sort
    deps: string[];
    produces: string[];
    consumes: string[];
  }[];
  edges: {
    from: string;
    to: string;
    type: 'intra' | 'inter';  // within DAG vs. cross-DAG
  }[];
}
```

**Benefits**:
- Index is ~10KB; full DAG is ~100-200KB
- Topo sort + batch calculation work on index alone
- LLM reads index + current batch full specs (~2-3 nodes), not all 50
- Saves ~90% tokens on position queries

### 4. Lazy Loading

**Components**:
- `consolidation/loader.ts`: Implement lazy-load predicate
- Gate: Load full node specs only for current batch + next batch (pre-warming)

**Logic**:
```
1. Load head-index.json (10KB)
2. Compute topo sort, parallel batches from index
3. Identify current batch + next batch via orient()
4. Load full specs only for those nodes
5. For chart/describe: load phase summaries, skip full specs
```

**Current Batch Calculation**:
- First batch where any node's artifacts are missing
- Use file existence check on `produces` paths
- For plan nodes: check if expanded children exist

**Pre-warming**:
- Load next batch specs in parallel during current batch execution
- Reduces perceived latency

### 5. Validation Integration

**Intra-DAG Validation** (unchanged):
- Cycles, disconnected nodes, missing deps within each DAG

**Inter-DAG Validation** (new):
- When validating merged graph: check that produced artifacts from phase N exist before depending nodes in phase N+1
- `verify(g)` respects phase boundaries: if B consumes what A produces, A must precede B in topo order
- During `complete(node)`: if node is terminal in its phase, validate all artifacts it declares for next phase exist

**Propagation Across Boundaries**:
- If dispatch-system node declares `validate: [{ type: 'artifact-exists', path: 'src/lib/protocol/types.ts' }]`
- And typescript-cleanup declares `produces: ['src/lib/protocol/types.ts']`
- Propagation correctly links the dependency (even across DAG boundary)

### 6. CLI Integration

**Entry Point**: `consolidation/cli-loader.ts`

**Integration Pattern**:
```typescript
// Before every CLI command:
const allDagFiles = await discoverDagFiles(roadmapRoot);
const graphs = await loadGraphs(allDagFiles);
const merged = mergeMultiWay(graphs);
const index = extractIndex(merged);

// Commands use merged graph transparently:
const pos = orient(merged, fileExists(root));
// ^ Returns position across all DAGs
```

**Commands Affected**:
- `orient` — returns position across all DAGs
- `chart` — visualizes all phases
- `show <node>` — works on any node in merged graph
- `complete <node>` — validates with inter-DAG rules
- `validate` — checks merged graph
- `advance` — respects phase boundaries

**No User-Facing Changes**:
- API is identical; merge happens transparently
- Users don't call `merge()` explicitly
- Existing workflows unchanged

### 7. Caching & Invalidation

**Session Cache**:
- Load merged DAG + index once per session
- Reuse for all CLI calls in that session
- Clear cache on explicit user request (`--no-cache`)

**File Change Detection**:
- On each CLI invocation: check `mtime` of `.roadmap/*.json`
- If any file changed since last cache: re-merge
- Cheap check (filesystem mtime only)

**Git Hook** (pre-commit):
- Before committing: re-validate merged DAG
- Update index if changed
- Prevent inconsistent state from being committed

### 8. Persistence Strategy

**Two Approaches** (decision point):

#### Option A: Consolidate on First Merge
- After first merge, write consolidated `.roadmap/head.json`
- Archive original files (or delete them)
- Single source of truth going forward
- Pro: Simpler; no re-merge on future sessions
- Con: Loses modularity of separate tracking DAGs

#### Option B: Keep Separate Files, Re-merge
- Keep original `.roadmap/typescript-cleanup-001.json`, etc.
- Re-merge on every session
- Allows independent tracking of each phase
- Pro: Preserves modularity; easier to parallelize work
- Con: Re-merge overhead on every session (small)

**Recommended**: Option B initially (modularity), with Option A as opt-in.

## Implementation Phases

### L0: consolidation-discovery (Plan Node)
✅ **Output**: This document (CONSOLIDATION-DESIGN.md)

### L1: Discovery & Merge Implementation
- `consolidation/discover.ts`: Scan `.roadmap/` for DAG files
- `consolidation/merge.ts`: Multi-way merge algorithm
- `consolidation/index.ts`: Extract metadata index
- `consolidation/__tests__/merge.test.ts`: Unit tests for merge logic

**Acceptance**: Merge logic merges 2-3 existing DAGs correctly; no cycles introduced.

### L2: Validation & Index Extraction
- `consolidation/validation.ts`: Inter-DAG validation rules
- Index extraction and schema validation
- Cross-DAG dependency verification

**Acceptance**: Merged DAG passes all validation rules; index is accurate and complete.

### L3: Lazy Loading Implementation
- `consolidation/loader.ts`: Lazy-load logic
- Current batch + next batch pre-warming
- Token efficiency measurements

**Acceptance**: Current batch loading uses <500 tokens; full DAG reads only when needed.

### L4: CLI Auto-Merge Integration
- `consolidation/cli-loader.ts`: Transparent merge on every CLI call
- Update `bin/roadmap` entry point to use consolidation loader
- Integration with orient, chart, show, complete commands

**Acceptance**: All CLI commands work transparently with merged DAGs; no API changes.

### L5: Integration Tests
- End-to-end tests: discover → merge → orient → chart
- Multi-phase workflows: complete node in phase N, check phase N+1 readiness
- Token usage validation

**Acceptance**: All acceptance criteria from spec pass; no regressions.

### L6-9: Documentation, Migration, Hooks, Completion
- Update docs explaining auto-merge behavior
- Migration script for consolidating existing separate DAGs
- Pre-commit hook for cache invalidation
- Final validation and documentation

## File Structure

```
src/lib/consolidation/
├── discover.ts          # DAG file discovery
├── loader.ts            # Load graphs + lazy-load logic
├── merge.ts             # Multi-way merge algorithm
├── index.ts             # Index extraction
├── validation.ts        # Inter-DAG validation
├── cli-loader.ts        # CLI entry point
├── __tests__/
│   ├── merge.test.ts
│   ├── discover.test.ts
│   ├── validation.test.ts
│   └── integration.test.ts
└── types.ts             # ConsolidationIndex, consolidation errors

.roadmap/
├── head.json            # Consolidated DAG (after merge)
├── head-index.json      # Metadata index
├── typescript-cleanup-001.json     # (kept for modularity)
├── dispatch-system-001.json        # (kept for modularity)
└── ...
```

## Key Design Decisions

1. **Auto-merge on every query** (not manual): Transparency is paramount; users shouldn't think about multiple DAGs
2. **Keep separate source files** (Option B): Preserves modularity; easier to debug individual phases
3. **Metadata index extraction**: ~90% token savings on position queries
4. **Phase boundaries auto-detection**: Merge detects connections based on produces/consumes overlap
5. **No user-facing API changes**: Existing workflows continue to work unchanged

## Success Criteria

- ✅ All CLI commands work transparently with merged DAGs
- ✅ `orient` returns position across all phases
- ✅ `chart` visualizes all parallel tracks with phase boundaries
- ✅ Token usage for position query: <500 tokens (vs. ~2000 currently)
- ✅ No manual file switching needed
- ✅ Inter-DAG validation passes
- ✅ All existing roadmap tests pass (no regressions)
- ✅ Merge is deterministic and idempotent

## Open Questions & Risks

1. **Question**: How to handle circular dependencies across DAGs? → Answer: Merge validation rejects them; user must reorganize phases
2. **Risk**: Performance on very large merged DAGs (50+ nodes) → Mitigate: Lazy loading + index caching
3. **Risk**: File modification race conditions → Mitigate: Git hook ensures consistency before commit
4. **Question**: Should we consolidate to single head.json or keep separate files? → Decision: Keep separate initially (modularity), consolidate on opt-in

## Next Steps

1. Implement discover + merge logic (L1)
2. Add validation + index extraction (L2)
3. Implement lazy loading (L3)
4. Integrate into CLI (L4)
5. Add comprehensive tests (L5)
6. Document + migration + hooks (L6-9)
