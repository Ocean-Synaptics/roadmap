# FR-META-REFAC-001: Execution Plan

## Overview

**Objective**: Execute the refactor survey pipeline deterministically, producing a next spec-kit that is governance-complete.

**Scope**: 5 serial phases (L00-L04) with one parallel burst (L01: N agents).

**Duration**: ~2-3h wall-clock (serial bottleneck: L02 fan-in, L03 specgen, L04 terminal gate).

**Success Gate**: L04 verdict = "PASS" → RECEIPT.json produced → next spec-kit importable.

---

## Execution Strategy

### Strategy A: validate-as-you-go (SELECTED)

**Rationale**: Incremental validation at each phase catches errors early; parallel agent work provides early feedback.

**Flow**:
```
L00: bootstrap (serial, 0.5h)
  ↓ (all agents ready)
L01: survey (parallel, 2-3 agents, 1-2h)
  ├─ agent-01 scans src/lib, src/protocol, src/agent
  ├─ agent-02 scans bin/, tests/
  └─ agent-03 scans docs/
  ↓ (all receipts collected)
L02: fan-in (serial, 0.5h)
  ↓ (synthesis deterministic, reproducible)
L03: specgen (serial, 1h)
  ↓ (next spec-kit generated, not yet validated)
L04: terminal intent gate (serial, 0.5h)
  ↓ (all 6 checks pass or fail → RECEIPT.json)
DONE (or escalate if L04 fails)
```

**Parallelism window**: L01 agents run fully parallel (no inter-agent deps). Scope partitioning ensures no cross-agent effects.

**Advantages**:
- Early discovery of issues (L02 determinism, L03 validator presence)
- Minimal re-work if agent receipt is malformed (fail fast)
- Feedback loop visible per phase

**Disadvantages**:
- Phase-by-phase sequencing (can't parallelize L02/L03)
- Re-runs if L04 rejects require re-doing L03

---

### Strategy B: hallucinate-then-validate (ALTERNATIVE)

**Flow**:
```
L00: bootstrap (serial, 0.5h)
L01: survey (parallel, 1-2h)
  └─ all N agents run in parallel to completion
L02-L04: batch validation (serial, 2h)
  ├─ L02: fan-in (all receipts must exist)
  ├─ L03: specgen (synthesis must be complete)
  └─ L04: terminal gate (all 5 gates must be present)
  ↓ (all checks at once)
PASS or rewind to L02 with fixes
```

**Advantages**:
- Whole-system view before synthesis (fewer partial failures)
- Can batch-fix issues across phases

**Disadvantages**:
- Higher latency between agent completion and validation
- Batch failures require more re-work

---

### Decision: validate-as-you-go (SELECTED)

**Why**: Lower latency, better failure visibility, aligns with roadmap protocol (phase-by-phase validation).

---

## Phases

### Phase L00: Bootstrap (Serial, 0.5h)

**Node**: `refac-run-bootstrap`

**Input**: Implicit repo state (git HEAD)

**Output**:
```
.audit/refactor-runs/<runId>/
  ├─ RUN.json
  │   ├─ repo.headSha: "<current git HEAD>"
  │   ├─ repo.repoRoot: "<abs path to repo>"
  │   ├─ timestamp: "<ISO 8601>"
  │   ├─ tool_versions: { node, npm, tsc, vitest }
  │   └─ rankingWeights: {
  │       benefitMultiplier: 10,
  │       effortCap: 15,
  │       riskPenalty: { low: 0, med: 10, high: 25 },
  │       conflictPenalty: 5,
  │       invariantBonus: 20
  │     }
  └─ agents/AGENTS.json
      └─ agents: [
           { agentId: "survey-01", promptHash: "<sha>", scope: { directories: [...], exclude: [...] } },
           { agentId: "survey-02", promptHash: "<sha>", scope: { directories: [...], exclude: [...] } },
           { agentId: "survey-03", promptHash: "<sha>", scope: { directories: [...], exclude: [...] } }
         ]
```

**Validation**:
- ✅ RUN.json schema valid
- ✅ AGENTS.json lists N agents with disjoint scopes
- ✅ repo.headSha is valid git ref

**Responsibility**: Orchestrator or CI job (script-driven init)

---

### Phase L01: Parallel Survey (1-2h per agent, N agents in parallel)

**Nodes**: `refac-survey-plan` (plan) → `refac-survey-agent-01`, `refac-survey-agent-02`, `refac-survey-agent-03` (execute)

**Input per agent**:
- Assigned directory scope (from AGENTS.json)
- Repo HEAD (read-only)

**Output per agent**:
```
.audit/refactor-runs/<runId>/agents/
  ├─ survey-01.receipt.json
  ├─ survey-02.receipt.json
  └─ survey-03.receipt.json
```

**Each receipt**:
```json
{
  "schema_version": 1,
  "agentId": "survey-01",
  "repo": { "headSha": "...", "repoRoot": "..." },
  "scope": { "directories": ["src/lib", "src/protocol"], "exclude": ["dist", "node_modules"] },
  "findings": [
    {
      "kind": "move",
      "title": "src/lib/foo.ts contains readFileSync; move to src/io/",
      "evidence": [
        { "path": "src/lib/foo.ts", "symbols": ["readFileSync"], "lines": [12, 33, 47] }
      ],
      "proposal": { "action": "move", "from": "src/lib/foo.ts", "to": "src/io/foo.ts", "notes": "preserve lib purity" },
      "impact": { "risk": "low", "effortHours": 2, "benefit": ["testSpeed", "clarity"] },
      "dependencies": [],
      "acceptance": ["No fs/process imports in src/lib/**"]
    },
    ...
  ],
  "metrics": {
    "duplicationClusters": 2,
    "suspectEntryPoints": 1,
    "testHotspots": ["tests/x.test.ts::slow-case"]
  }
}
```

**Validation per agent**:
- ✅ receipt.json schema valid
- ✅ findings non-empty (≥1 finding)
- ✅ every finding has evidence (path + lines or symbols)
- ✅ evidence paths exist in repo (optional: lint check)

**Parallelism contract**:
- Agents have **disjoint directory scopes** — no overlap, no cross-agent effects
- Each agent runs **read-only** — no writes to repo
- Agents produce **structured, independently-verifiable receipts**

**Responsibility**: N independent agents (spawned via TeamCreate)

---

### Phase L02: Fan-in & Synthesis (Serial, 0.5h)

**Node**: `refac-fan-in-synthesis`

**Input**:
- N receipts (all `agents/survey-*.receipt.json`)
- RUN.json (for ranking weights)

**Algorithm**:
1. **De-duplication**: group findings by kind + normalized paths
2. **Clustering**:
   - Key: `hash(kind + normalizedPath(from) + normalizedPath(to) + symbolSet)`
   - Merge findings with same key into one cluster
   - Example: if agent-01 and agent-02 both propose moving `src/lib/foo.ts` → `src/io/foo.ts`, they merge into one cluster
3. **Ranking**:
   - Score per cluster = `benefitCount * 10 + max(0, 15 - effortHours) - riskPenalty - conflictPenalty + invariantBonus`
   - Sort clusters by descending score
   - Tie-break: alphabetically by clusterId
4. **Conflict detection**: identify mutually exclusive proposals (e.g., "move X to Y" vs "delete X")
5. **Summary**:
   - Layout target (if any move proposals)
   - CLI surface delta (if any CLI-wrapping proposals)
   - Perf targets (from test hotspot findings)
   - Recommended plan (ranked cluster order)

**Output**:
```
.audit/refactor-runs/<runId>/fan-in/
  ├─ SYNTHESIS.json
  │   ├─ clusters: [
  │   │   { clusterId: "move-lib-io-001", kind: "move", members: ["survey-01:1", "survey-02:1"], rankedScore: 45, ... },
  │   │   ...
  │   │ ]
  │   ├─ ranked: [ { clusterId: "move-lib-io-001", score: 45 }, ... ]
  │   ├─ conflicts: [ { proposalIds: ["cluster-A", "cluster-B"], reason: "both propose different destinations for X" } ]
  │   ├─ layoutTarget: { ... }
  │   ├─ cliSurfaceDelta: [...]
  │   ├─ perfTargets: [...]
  │   ├─ recommendedPlan: [clusterId ordered by rank]
  │   └─ determinismHash: "<sha256 of all above>"
  └─ SYNTHESIS.md
      └─ Human-readable summary (derived from SYNTHESIS.json)
```

**Determinism contract**:
- Given identical N receipts + RUN.json, SYNTHESIS.json is byte-for-byte identical
- Clustering key is deterministic (fixed hash function)
- Ranking is deterministic (fixed weights, stable sort)
- Conflict resolution is deterministic (fixed precedence)

**Validation**:
- ✅ SYNTHESIS.json schema valid
- ✅ clusters non-empty (≥1 cluster)
- ✅ determinism check: run twice, verify hash stable

**Responsibility**: Orchestrator (deterministic algorithm, no human input)

---

### Phase L03: Spec-kit Generation (Serial, 1h)

**Node**: `refac-specgen`

**Input**:
- SYNTHESIS.json
- SYNTHESIS.md

**Algorithm**:
1. **Generate SPEC.md**: synthesize feature request from top-N clusters (by rank)
2. **Generate TASKS.md**: decompose SYNTHESIS into a roadmap-importable node DAG
   - One task per cluster (or group of related clusters)
   - Each task has produces (code moves/edits), consumes (source files), validate (tests pass, metrics improve)
   - Include 5 terminal intent gates: intent-init, intent-term, mine-run, audit-surface, perf-budget
3. **Generate PLAN.md**: execution strategy (which clusters to tackle first, dependencies, parallelism windows)
4. **Generate GALLERY.json**: at least 2 candidate execution strategies
   - Strategy A: "cluster-first" (tackle high-value clusters first)
   - Strategy B: "risk-first" (tackle risky changes first to discover blockers)
5. **Generate SELECTED.json**: record strategy choice + repo HEAD + synthesis hash (for auditability)

**Output**:
```
.specify/fr-meta-refac-001/
  ├─ SPEC.md
  │   ├─ Problem statement
  │   ├─ Goal
  │   ├─ Success criteria (from clusters + synthesis)
  │   └─ Given/When/Then scenarios
  ├─ TASKS.md
  │   ├─ L00 batch (init)
  │   ├─ L01 batch (parallel execution nodes)
  │   ├─ L02 batch (verification + validation)
  │   └─ Terminal intent gates (5 nodes)
  ├─ PLAN.md
  │   ├─ Overview
  │   ├─ Batching strategy
  │   ├─ Parallelism windows
  │   └─ Risk mitigations
  ├─ GALLERY.json
  │   ├─ strategies: [
  │   │   { id: "cluster-first", name: "...", description: "...", rationale: "..." },
  │   │   { id: "risk-first", name: "...", description: "...", rationale: "..." }
  │   │ ]
  │   └─ examples: [...]
  └─ SELECTED.json
      ├─ specId: "fr-meta-refac-001"
      ├─ selectedStrategy: "cluster-first"
      ├─ repo: { headSha: "...", timestamp: "..." }
      ├─ synthesis: { hash: "..." }
      ├─ reasoning: "..."
      └─ timestamp: "..."
```

**Validation**:
- ✅ TASKS.md DAG has no cycles (tsc + roadmap import validation)
- ✅ All nodes in TASKS.md have ≥1 validator
- ✅ All 5 terminal intent gates present
- ✅ GALLERY.json has ≥2 strategies
- ✅ SELECTED.json binds to repo.headSha + synthesis.hash

**Responsibility**: Orchestrator (template-driven generation; deterministic logic)

---

### Phase L04: Terminal Intent Gate (Serial, 0.5h)

**Node**: `intent-refac-pipeline`

**Input**:
- SPEC.md, TASKS.md, PLAN.md, GALLERY.json, SELECTED.json

**Checks** (all must pass):
1. **Spec coherence**: SPEC.md is motivating, success criteria are clear
2. **Tasks DAG acyclic**: no cycles in produced TASKS.md DAG
3. **All nodes have validators**: every node in TASKS.md has ≥1 validation rule
4. **Terminal gates present**: all 5 gates exist (intent-init, intent-term, mine-run, audit-surface, perf-budget)
5. **Strategies distinct**: GALLERY.json strategies are substantively different (not duplicates)
6. **Selected binds to HEAD**: SELECTED.json.repo.headSha matches repo HEAD, synthesis hash matches SYNTHESIS.json

**Output**:
```
.audit/refactor-runs/<runId>/
  └─ RECEIPT.json
      ├─ runId: "<runId>"
      ├─ specId: "fr-meta-refac-001"
      ├─ repo: { headSha: "...", timestamp: "..." }
      ├─ artifacts: {
      │   spec_md_sha: "<sha256 of SPEC.md>",
      │   tasks_md_sha: "<sha256 of TASKS.md>",
      │   plan_md_sha: "<sha256 of PLAN.md>",
      │   gallery_json_sha: "<sha256 of GALLERY.json>",
      │   selected_json_sha: "<sha256 of SELECTED.json>"
      │ }
      ├─ gatePasses: {
      │   spec_coherence: true,
      │   tasks_dag_acyclic: true,
      │   all_nodes_have_validators: true,
      │   terminal_gates_present: true,
      │   gallery_strategies_distinct: true,
      │   selected_binds_to_head: true
      │ }
      ├─ verdict: "PASS" | "FAIL" | "ESCALATE"
      ├─ reasoning: "..."
      └─ timestamp: "..."
```

**Verdicts**:
- **PASS**: all 6 checks pass → output is governance-complete, ready for import + execution
- **FAIL**: one or more checks fail → output is incomplete; specgen or selection logic needs revision
- **ESCALATE**: checks pass, but synthesis or spec reveals deeper governance issues (rare)

**Validation**:
- ✅ RECEIPT.json schema valid
- ✅ All gatePasses values present
- ✅ Verdict matches gate results

**Responsibility**: Orchestrator (deterministic validation + decision)

---

## Batching & Parallelism

### Current Batch (L00)

```
Batch L00: refac-run-bootstrap
├─ Produces: RUN.json, AGENTS.json
├─ Consumes: repo state (implicit)
└─ Duration: 0.5h
```

### Next Batch (L01)

```
Batch L01: refac-survey-plan + N agents
├─ refac-survey-plan (plan mode)
│  └─ expands → refac-survey-agent-01, agent-02, agent-03 (execute mode, parallel)
│     ├─ agent-01: scan src/lib, src/protocol, src/agent
│     ├─ agent-02: scan bin/, tests/
│     └─ agent-03: scan docs/
├─ Parallelism: full (no inter-agent deps)
└─ Duration: 1-2h per agent (wall-clock: 1-2h parallel)
```

### Subsequent Batches (L02-L04)

```
Batch L02: refac-fan-in-synthesis
├─ Consumes: all L01 receipts
├─ Produces: SYNTHESIS.json
└─ Duration: 0.5h (serial, after L01 complete)

Batch L03: refac-specgen
├─ Consumes: SYNTHESIS.json
├─ Produces: SPEC.md, TASKS.md, PLAN.md, GALLERY.json, SELECTED.json
└─ Duration: 1h (serial, after L02 complete)

Batch L04: intent-refac-pipeline (terminal)
├─ Consumes: all L03 outputs
├─ Produces: RECEIPT.json
└─ Duration: 0.5h (serial, after L03 complete)
```

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Agent scopes overlap → duplicate proposals | AGENTS.json pre-partitions scopes; validation check for disjointness |
| Agent receipt malformed | Schema validation + evidence non-empty check; fail fast in L02 |
| SYNTHESIS.json non-deterministic | Fixed weights in RUN.json, stable sort, determinism hash check |
| Generated TASKS.md has cycles | Run tsc + cycle checker before L04; reject if cycles found |
| Terminal gates missing | Validation check in specgen; list required gates and verify presence |
| L04 rejects → re-do L03 | Keep synthesis unchanged; only revise specgen logic + re-run |
| Spec-kit import fails | TASKS.md validated against roadmap schema before L04 completes |

---

## Handoff

**Upon L04 verdict = "PASS"**:
```bash
roadmap import --from speckit .specify/fr-meta-refac-001/TASKS.md --id <next-dag-id>
```

This creates a new roadmap DAG from the generated spec-kit, ready for execution. The next iteration begins.

---

## Notes

- **Serial wall-clock**: ~2-3h (mostly L01 agent work, which is parallelizable)
- **Rerunnable**: Given same repo HEAD + same agent code, result is deterministic
- **Audit trail**: RUN.json + all receipts + SYNTHESIS.json + RECEIPT.json form a complete decision record
- **Next iteration**: Output spec-kit can be improved iteratively (survey again with refined agents, adjust ranking weights, select different strategy)

