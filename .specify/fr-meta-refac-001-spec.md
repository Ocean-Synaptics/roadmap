# FR-META-REFAC-001: Refactor Survey Swarm → Fan-in Analysis → Next Spec-kit Run

## Problem Statement

Refactoring decisions in large codebases are typically made through:
1. **Informal discovery** — developers spot issues (duplication, structural problems, slow tests)
2. **Ad-hoc consensus** — teams discuss, but no systematic capture of trade-offs
3. **Serial execution** — one or two developers implement changes; no parallel insight gathering
4. **Lost context** — next iteration repeats discovery from scratch

This creates friction, missed opportunities, and non-deterministic outcomes. Each refactor cycle lacks:
- **Structured evidence** — proposals tied to concrete file paths, line numbers, symbol references
- **Deterministic synthesis** — same input (N developers' feedback) should produce same ranking/clustering
- **Actionable next steps** — no automatic handoff to spec-kit for next iteration
- **Governance audit trail** — no receipt binding decisions to repo state

## Goal

Build a **repeatable, deterministic pipeline** that:
1. **Spawns N agents to independently scan** assigned directory scopes for refactoring opportunities
2. **Collects structured receipts** (evidence + proposals + impact metrics) from each agent
3. **Synthesizes findings deterministically** — clustering proposals, ranking by ROI, detecting conflicts
4. **Generates the next spec-kit automatically** — transforming synthesis into an executable DAG
5. **Gates the output** — terminal intent check ensuring governance completeness before implementation

**Outcome**: a **repeatable, autonomous refactoring-iteration system** that reduces discovery friction and improves decision quality through determinism + evidence.

---

## Success Criteria

### For the Refactor Pipeline (L00-L04)

1. **Survey phase (L01)**
   - ✅ N agents spawn with disjoint directory scopes (no overlap)
   - ✅ Each agent produces structured receipt: `agents/<id>.receipt.json`
   - ✅ Every finding in receipt has ≥1 evidence entry (path + line numbers OR symbol anchors)
   - ✅ Receipt schema valid: `schema_version=1`, all required fields present

2. **Determinism (L02)**
   - ✅ Given identical N receipts, SYNTHESIS.json hash is identical (stable clustering + ranking)
   - ✅ Clustering key: `hash(kind + normalizedPath(from) + normalizedPath(to) + symbolSet)` deterministic
   - ✅ Ranking: fixed weights in RUN.json produce stable score order
   - ✅ Conflict detection: deterministic precedence when proposals conflict
   - ✅ SYNTHESIS contains ≥1 cluster (no degenerate empty synthesis)

3. **Spec-kit Generation (L03)**
   - ✅ Generated TASKS.md passes import validation: no cycles, all validators present
   - ✅ All 5 terminal intent gates present: `intent-init`, `intent-term`, `mine-run`, `audit-surface`, `perf-budget`
   - ✅ GALLERY.json contains ≥2 distinct execution strategies
   - ✅ SELECTED.json binds strategy choice to repo HEAD sha + synthesis hash
   - ✅ SPEC.md and PLAN.md are coherent and motivating

4. **Governance Gate (L04)**
   - ✅ All 6 sub-checks pass: spec coherence, DAG acyclic, all validators, gates present, strategies distinct, selected binds
   - ✅ RECEIPT.json produced with verdict (PASS/FAIL/ESCALATE) + reasoning
   - ✅ Terminal gate evidence links back to L03 artifacts (hashes, paths)

### For Operational Deployment

5. **Integration**
   - ✅ Output consumable by: `roadmap import --from speckit .specify/<specId>/TASKS.md --id <next-dag-id>`
   - ✅ Pipeline composable with existing roadmap infra (no new CLI commands required; uses existing import)

6. **Auditability**
   - ✅ RUN.json records repo HEAD, tool versions, ranking weights, agent roster
   - ✅ RECEIPT.json records all intermediate artifact hashes (RUN, receipts, synthesis, spec outputs)
   - ✅ All decisions traceable to evidence

---

## Given/When/Then Scenarios

### Scenario 1: Simple Refactoring Survey (L00-L02)

**Given**:
- Repo HEAD at commit `abc123`
- N=3 agents with disjoint scopes: [src/lib, src/cli, tests/]
- Each agent finds 4-6 refactoring opportunities

**When**:
- `refac-run-bootstrap` initializes RUN.json, AGENTS.json
- Each agent produces receipt with findings + evidence
- `refac-fan-in-synthesis` clusters and ranks

**Then**:
- SYNTHESIS.json contains ≥3 clusters
- All clusters ranked by stable score
- No orphaned findings (every finding has evidence)
- SYNTHESIS.json hash reproducible from same receipts

---

### Scenario 2: Deterministic Synthesis (L02 Reproducibility)

**Given**:
- Two independent runs of the pipeline with identical agent receipts
- Same RUN.json ranking weights

**When**:
- Both runs execute `refac-fan-in-synthesis`

**Then**:
- SYNTHESIS.json hash identical in both runs
- Cluster membership stable
- Ranked order stable
- Conflict detection output stable

---

### Scenario 3: Spec-kit Generation Validates Governance (L03-L04)

**Given**:
- SYNTHESIS.json produced with 5 proposal clusters

**When**:
- `refac-specgen` generates SPEC.md, TASKS.md, PLAN.md, GALLERY.json, SELECTED.json

**Then**:
- Generated TASKS.md has no cycles
- All nodes in generated TASKS.md have ≥1 validator
- All 5 terminal intent gates present (intent-init, intent-term, mine-run, audit-surface, perf-budget)
- GALLERY.json lists 2+ candidate execution strategies
- SELECTED.json records strategy choice + repo HEAD + synthesis hash

---

### Scenario 4: Terminal Intent Gate Rejects Incomplete Spec (L04 Enforcement)

**Given**:
- Generated SPEC.md is coherent
- But generated TASKS.md is missing one terminal gate (e.g., no perf-budget)

**When**:
- `intent-refac-pipeline` runs validation

**Then**:
- Gate check fails: "terminal gates present"
- RECEIPT.json verdict = "FAIL"
- Reasoning explains which gate is missing
- Pipeline stops; specgen logic must be revised before retry

---

### Scenario 5: End-to-End: Survey → Synthesis → Next DAG

**Given**:
- Complete FR-META-REFAC-001 pipeline executes from L00 to L04
- All gates pass

**When**:
- L04 produces RECEIPT.json with verdict = "PASS"

**Then**:
- `.specify/<specId>/TASKS.md` is importable to roadmap
- `roadmap import --from speckit .specify/<specId>/TASKS.md --id <next-dag-id>` succeeds
- New DAG is oriented at L00 of the generated spec
- Refactor work can begin

---

## Acceptance Tests (Minimum)

1. **Survey receipt validation**: reject if evidence is missing or empty
2. **Determinism verification**: run synthesis twice with same receipts, verify SYNTHESIS.json hash stable
3. **Cluster deduplication**: two receipts proposing identical move merge into same cluster
4. **Spec-kit import validation**: generated TASKS.md passes `roadmap import --from speckit` (no cycles)
5. **Terminal gates presence check**: all 5 required gates found in generated TASKS.md
6. **Strategy gallery**: GALLERY.json contains ≥2 strategies, SELECTED binds to repo HEAD

---

## Constraints & Non-Goals

### Constraints

- **Determinism required**: Synthesis output must be reproducible (fixed weights, stable sort)
- **Evidence binding**: Every proposal must tie to file path + line numbers (or symbol anchors)
- **Governance completeness**: Generated spec-kit must pass all terminal intent gates before execution
- **Audit trail**: RUN.json and RECEIPT.json must record all decision points (hashes, weights, verdicts)

### Non-Goals

- Agents directly editing code during survey phase (survey phase is read-only)
- "Generic refactor advice" — all proposals must be concrete (not hand-wavy)
- One-shot recommendations — pipeline is designed for iteration (multiple survey runs over time)
- Replacing human judgment — synthesis proposes; humans select strategy in SELECTED.json

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| N agents produce conflicting scopes (overlap) | Duplication in receipts | AGENTS.json explicitly partitions scopes; pre-run validation |
| Ranking weights biased (e.g., favor low-effort) | Bad prioritization in SYNTHESIS | Weights in RUN.json are explicit, reviewable; can be tuned per run |
| Specgen produces DAG with cycles | Pipeline fails at L04 | TASKS.md passed through cycle-check before specgen produces output |
| Strategy gallery is degenerate (only 1 strategy) | No genuine choice | GALLERY.json enforced ≥2 strategies; L04 gate checks count |
| Agent produces receipt with orphaned findings (no evidence) | Can't trace decisions | Evidence validation in agent validator; `shell` rule rejects empty findings |

---

## Timeline & Effort

| Phase | Effort | Notes |
|-------|--------|-------|
| **L00: Bootstrap** | 0.5h | Scripted init; produces metadata files |
| **L01: Survey (parallel)** | 1-2h per agent | Depends on repo size + agent sophistication; parallelizable |
| **L02: Fan-in** | 0.5h | Deterministic clustering + ranking; fixed latency |
| **L03: Specgen** | 1h | Template-driven generation + validation |
| **L04: Terminal Gate** | 0.5h | Validation checks; deterministic |
| **Total (serial wall-clock)** | ~3-4h | With N=3 agents in parallel, ~2-3h |

---

## Deployment Path

1. **Spec approved** ✓ (you are here)
2. **Roadmap import** — convert TASKS.md to roadmap DAG
3. **Agent spawning** — TeamCreate + dispatch N agents to L01 scopes
4. **Execution** — agents run survey, ingest receipts, fan-in, specgen, terminal gate
5. **Next iteration** — RECEIPT.json verdict = "PASS", import generated TASKS.md as next DAG

---

## Bibliography

- **Deterministic synthesis**: fixed clustering keys + ranking weights ensure reproducibility
- **Plan node expansion**: L01 plan node expands into N execute nodes; each carries `expandedFrom` provenance
- **Terminal intent gate**: L04 validates governance completeness before downstream execution
- **Spec-kit intake**: generated TASKS.md is importable to roadmap, bootstrapping next iteration

