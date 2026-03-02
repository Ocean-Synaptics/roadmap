# FR-META-REFAC-001: Refactor Survey Swarm → Fan-in Analysis → Next Spec-kit Run

**Objective**: Parallel agent-driven code refactoring survey, deterministic synthesis, and automatic spec-kit generation for next iteration.

**Acceptance Gate**: Terminal intent checks that generated next spec-kit is governance-complete (no cycles, all validators, terminal gates, intent gates present).

---

## Batch L00: Run Initialization

### refac-run-bootstrap

**Mode**: execute
**Track**: [ARTIFACT]
**Affects**: [L01, L02, L03, L04]

**Description**:
Initialize refactor survey run directory, record baseline metadata (repo HEAD, tool versions, agent roster schema).

**Produces**:
- `.audit/refactor-runs/<runId>/RUN.json` — run metadata (headSha, timestamp, tool versions, ranking weights)
- `.audit/refactor-runs/<runId>/agents/AGENTS.json` — agent roster schema (agentId, promptHash, scope per agent)
- `.audit/refactor-runs/<runId>/.gitkeep` — directory marker

**Consumes**:
- Implicit: repo HEAD state (from git)

**Validate**:
```json
[
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/RUN.json" },
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/agents/AGENTS.json" },
  { "type": "artifact-schema", "path": ".audit/refactor-runs/<runId>/RUN.json", "schema": { "repo": { "headSha": "string", "repoRoot": "string" }, "timestamp": "string", "rankingWeights": "object" } },
  { "type": "artifact-schema", "path": ".audit/refactor-runs/<runId>/agents/AGENTS.json", "schema": { "agents": [{ "agentId": "string", "promptHash": "string", "scope": { "directories": ["string"], "exclude": ["string"] } }] } }
]
```

---

## Batch L01: Parallel Survey (Plan Nodes)

### refac-survey-plan

**Mode**: plan
**Track**: [EXPANSION]
**Affects**: [L02]

**Description**:
Placeholder plan node that expands into N parallel survey agents. Each agent independently scans assigned directory scope for refactoring opportunities and produces a receipt.

During execution, this plan node will expand into `refac-survey-agent-<01..N>` nodes (where N is configurable, default 3-5).

**Produces**: (empty; plan node — validates via `expanded`)

**Consumes**:
- `.audit/refactor-runs/<runId>/RUN.json`
- `.audit/refactor-runs/<runId>/agents/AGENTS.json`

**Validate**:
```json
[
  { "type": "expanded", "minNodes": 3 }
]
```

**Expansion Rationale**:
N independent agents can scan disjoint directory scopes in parallel without coordination overhead. Each produces a structured receipt; fan-in de-duplicates and ranks proposals.

---

### refac-survey-agent-<N> (implicit, expands from plan)

**Mode**: execute
**Track**: [ARTIFACT]
**ExpandedFrom**: refac-survey-plan
**Affects**: [L02]

**Description** (per agent):
Scan assigned directory scope for refactoring opportunities. Identify: moves, merges, deletions, CLI wraps, splits, renames, dep cycles, test hotspots, duplication, side effects. Produce structured receipt with evidence (file paths, line numbers, symbol anchors).

**Produces**:
- `.audit/refactor-runs/<runId>/agents/<agentId>.receipt.json` — structured findings (see schema below)

**Consumes**:
- `.audit/refactor-runs/<runId>/agents/AGENTS.json` (to read assigned scope)

**Validate**:
```json
[
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/agents/<agentId>.receipt.json" },
  { "type": "artifact-schema", "path": ".audit/refactor-runs/<runId>/agents/<agentId>.receipt.json", "schema": {
    "schema_version": 1,
    "agentId": "string",
    "repo": { "headSha": "string", "repoRoot": "string" },
    "scope": { "directories": ["string"], "exclude": ["string"] },
    "findings": [{"kind": "string", "title": "string", "evidence": [{"path": "string", "symbols": ["string"], "lines": ["number"]}], "proposal": "object", "impact": {"risk": "enum(low|med|high)", "effortHours": "number", "benefit": ["string"]}, "dependencies": ["string"], "acceptance": ["string"]}],
    "metrics": {"duplicationClusters": "number", "suspectEntryPoints": "number", "testHotspots": ["string"]}
  } },
  { "type": "shell", "command": "jq '.findings | length' .audit/refactor-runs/<runId>/agents/<agentId>.receipt.json | grep -qv '^0$'", "description": "receipt must contain at least one finding" }
]
```

**Hard Rule**: Every finding must have ≥1 evidence entry (path + line numbers or symbol anchors). No finding without referent.

---

## Batch L02: Fan-in Synthesis

### refac-fan-in-synthesis

**Mode**: execute
**Track**: [ARTIFACT]
**Affects**: [L03]

**Description**:
Merge all N agent receipts into a single synthesis. Deterministically cluster findings by `hash(kind + normalizedPath(from) + normalizedPath(to) + normalizedSymbolSet)`. Rank by weighted score: `benefitCount * 10 + (15 - effortHours) + riskPenalty + conflictPenalty + invariantBonus`. Identify conflicts (mutually exclusive proposals). Propose final layout + CLI surface delta + perf targets.

**Produces**:
- `.audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json` — clusters, rankings, conflicts, layout target, perf targets
- `.audit/refactor-runs/<runId>/fan-in/SYNTHESIS.md` — human-readable summary (derived from JSON)

**Consumes**:
- `.audit/refactor-runs/<runId>/agents/*.receipt.json` (all N agent receipts)

**Validate**:
```json
[
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json" },
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/fan-in/SYNTHESIS.md" },
  { "type": "artifact-schema", "path": ".audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json", "schema": {
    "clusters": [{"clusterId": "string", "kind": "string", "members": ["string"], "representatives": "object", "rankedScore": "number"}],
    "ranked": [{"clusterId": "string", "proposal": "object", "score": "number", "effortHours": "number", "riskLevel": "enum(low|med|high)"}],
    "conflicts": [{"proposalIds": ["string"], "reason": "string"}],
    "layoutTarget": "object",
    "cliSurfaceDelta": [{"action": "string", "command": "string"}],
    "perfTargets": [{"metric": "string", "target": "string"}],
    "recommendedPlan": [{"clusterId": "string", "order": "number"}],
    "determinismHash": "string"
  } },
  { "type": "shell", "command": "test -s .audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json && jq '.clusters | length > 0' .audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json", "description": "SYNTHESIS must contain at least one cluster" }
]
```

**Determinism Contract**: Given identical receipts, SYNTHESIS.json hash must be stable (fixed ranking weights, stable sort order, deterministic clustering key).

---

## Batch L03: Spec-kit Generation

### refac-specgen

**Mode**: execute
**Track**: [ARTIFACT]
**Affects**: [L04]

**Description**:
Generate next spec-kit from synthesis. Output: SPEC.md (feature-request style), TASKS.md (node decomposition), PLAN.md (execution strategy + batching), GALLERY.json (candidate plans), SELECTED.json (strategy selection receipt). Validate: no cycles, all nodes have validators, terminal intent gates present (intent-init, intent-term, mine-run, audit-surface, perf-budget).

**Produces**:
- `.specify/<specId>/SPEC.md` — generated feature specification
- `.specify/<specId>/TASKS.md` — node decomposition (spec-kit format)
- `.specify/<specId>/PLAN.md` — execution plan + batching windows
- `.specify/<specId>/GALLERY.json` — candidate strategies (≥2 strategies: validate-as-you-go, hallucinate-then-validate)
- `.specify/<specId>/SELECTED.json` — selection receipt (strategy id, repo head sha, synthesis hash, reasoning)

**Consumes**:
- `.audit/refactor-runs/<runId>/fan-in/SYNTHESIS.json`
- `.audit/refactor-runs/<runId>/fan-in/SYNTHESIS.md`

**Validate**:
```json
[
  { "type": "artifact-exists", "path": ".specify/<specId>/SPEC.md" },
  { "type": "artifact-exists", "path": ".specify/<specId>/TASKS.md" },
  { "type": "artifact-exists", "path": ".specify/<specId>/PLAN.md" },
  { "type": "artifact-exists", "path": ".specify/<specId>/GALLERY.json" },
  { "type": "artifact-exists", "path": ".specify/<specId>/SELECTED.json" },
  { "type": "shell", "command": "jq '.strategies | length >= 2' .specify/<specId>/GALLERY.json", "description": "must have ≥2 candidate strategies" },
  { "type": "shell", "command": "grep -q 'intent-init' .specify/<specId>/TASKS.md && grep -q 'intent-term' .specify/<specId>/TASKS.md && grep -q 'mine-run' .specify/<specId>/TASKS.md && grep -q 'audit-surface' .specify/<specId>/TASKS.md && grep -q 'perf-budget' .specify/<specId>/TASKS.md", "description": "all 5 terminal intent gates must be present" },
  { "type": "spec-conformance", "spec": ".specify/<specId>/SPEC.md", "scenario": "Generated TASKS.md has no cycles", "section": "Acceptance Tests" },
  { "type": "spec-conformance", "spec": ".specify/<specId>/SPEC.md", "scenario": "All nodes have ≥1 validator", "section": "Acceptance Tests" },
  { "type": "spec-conformance", "spec": ".specify/<specId>/SPEC.md", "scenario": "Terminal intent gates present", "section": "Acceptance Tests" }
]
```

---

## Batch L04: Terminal Intent Gate

### intent-refac-pipeline

**Mode**: execute
**Track**: [INTENT_GATE]
**Affects**: [] (terminal)

**Description**:
Verify that the generated next spec-kit is governance-complete and implementable. Check:
- SPEC.md is coherent and motivating
- TASKS.md node DAG has no cycles (via roadmap DAG compiler)
- Every node has ≥1 validation rule
- All 5 terminal intent gates present
- GALLERY.json candidate strategies are distinct and justified
- SELECTED.json binds to repo HEAD sha and synthesis hash

This is the acceptance gate for the entire FR-META-REFAC-001 run. Failure here means generation or selection logic needs revision before implementation can proceed.

**Produces**:
- `.audit/refactor-runs/<runId>/RECEIPT.json` — terminal gate receipt (all artifact hashes, pass/fail verdict, timestamp)

**Consumes**:
- `.specify/<specId>/SPEC.md`
- `.specify/<specId>/TASKS.md`
- `.specify/<specId>/PLAN.md`
- `.specify/<specId>/GALLERY.json`
- `.specify/<specId>/SELECTED.json`

**Validate**:
```json
[
  { "type": "artifact-exists", "path": ".audit/refactor-runs/<runId>/RECEIPT.json" },
  { "type": "artifact-schema", "path": ".audit/refactor-runs/<runId>/RECEIPT.json", "schema": {
    "runId": "string",
    "specId": "string",
    "repo": { "headSha": "string", "timestamp": "string" },
    "artifacts": {
      "spec_md_sha": "string",
      "tasks_md_sha": "string",
      "plan_md_sha": "string",
      "gallery_json_sha": "string",
      "selected_json_sha": "string"
    },
    "gatePasses": { "spec_coherence": "boolean", "tasks_dag_acyclic": "boolean", "all_nodes_have_validators": "boolean", "terminal_gates_present": "boolean", "gallery_strategies_distinct": "boolean", "selected_binds_to_head": "boolean" },
    "verdict": "enum(pass|fail|escalate)",
    "reasoning": "string",
    "timestamp": "string"
  } },
  { "type": "shell", "command": "jq '.gatePasses | all' .audit/refactor-runs/<runId>/RECEIPT.json | grep -q true", "description": "all 6 gate sub-checks must pass" },
  { "type": "spec-conformance", "spec": ".specify/<specId>/SPEC.md", "scenario": "Next spec-kit is implementable and governance-complete", "section": "Terminal Intent Gate" }
]
```

---

## CLI Surface (Integration Points)

```bash
# Dispatch survey run
refactor survey init --run <runId> --agents <n> --note "..."
refactor survey dispatch --run <runId>

# Ingest receipts
refactor survey ingest --run <runId> --agent <id> --receipt <path>

# Fan-in
refactor synthesize --run <runId> --note "..."

# Spec-kit generation
refactor specgen --run <runId> --out .specify/<specId>/ --note "..."
refactor select --run <runId> --strategy <name> --note "..."

# Terminal gate
refactor export --run <runId>

# Consume next spec
roadmap import --from speckit .specify/<specId>/TASKS.md --id <next-dag-id>
```

---

## Acceptance Tests (Minimum Gate)

1. **Survey receipts**: ✓ reject missing evidence lines, empty findings
2. **Determinism**: ✓ given fixed receipts, SYNTHESIS.json hash stable
3. **Clustering**: ✓ two receipts proposing same move merge into one cluster
4. **Specgen validity**: ✓ generated TASKS.md passes import validation (no cycles)
5. **Terminal gates present**: ✓ intent-init/term + mining + perf budget + audit surface exist
6. **Strategy gallery present**: ✓ ≥2 strategies emitted, SELECTED binds to headSha

---

## Expansion Strategy

### Phase Strategy: validate-as-you-go
- Smallest working unit: produce artifact → validate → move to next
- Parallelism: L01 agents run fully parallel (no inter-agent deps)
- Risk: may find issues late if validation rules are incomplete
- Benefit: incremental feedback, easier to debug per agent

### Phase Strategy: hallucinate-then-validate
- All L01 agents run → produce all receipts → batch validation → fix → rerun
- Parallelism: same (L01 parallel), but L02/L03 depends on L01 complete
- Risk: batch failures require re-running agents
- Benefit: whole-system view before synthesis, fewer iterations in practice

**Selected**: validate-as-you-go (default; lower latency for typical refactors)

---

## Notes

- **Determinism**: All ranking weights, sort orders, and clustering keys fixed in `RUN.json` so synthesis is reproducible
- **Extensibility**: Evidence schema supports line numbers (preferred) or symbol anchors; validators accept both
- **Integration**: `refactor export` emits `RECEIPT.json`; `roadmap import` consumes `TASKS.md` directly
- **Failure mode**: if specgen rejects terminal gates, re-run synthesis and specgen with updated rules

