# Metaflow Analysis & Recommendations

**Generated:** 2026-03-01
**Based on Iteration 2 Infrastructure**

---

## Current Metaflows

### 1. Display Audit Flow (DS-*)
**Status:** ✅ Implemented
**Purpose:** Detect regressions in CLI output rendering

**Detectors:**
- `detectMissingTable` — Table output validation
- `detectMissingDagRender` — DAG rendering validation
- `detectMissingProgressBar` — Progress bar validation
- `detectDisplayRegression` — Overall display regression detection

**Runnable:** YES (via `roadmap mf audit`)

---

### 2. Integration Audit Flow (INT-*)
**Status:** ✅ Implemented
**Purpose:** Detect integration rough points and friction

**Detectors:**
- `detectIntegrationRoughPoints` — Find integration issues from mining data
- Analyzes receipt patterns, command sequencing, error recovery

**Runnable:** YES (via `roadmap mf audit`)

---

### 3. Metaflow Compliance Flow (MF-*)
**Status:** ✅ Implemented
**Purpose:** Enforce metaflow protocol compliance

**Detectors:**
- `MF-001` — `detectMissingSelfInsert` — Verify self-insert layer active for eligible commands
- `MF-002` — `detectMissingSurfaceHeader` — Verify surface headers in wrapped commands
- `MF-003` — `detectActiveRunNotPrinted` — Verify active run ID printed in render
- `MF-004` — `detectStateMutationWithoutRunBinding` — Detect state mutations without run context
- `MF-005` — `detectDisplayReceiptMissingRunId` — Verify display receipts have runId

**Runnable:** YES (via detectors, integrated in audit)
**Coverage:** 5 checks
**Status:** All eligible commands, self-insert, surface headers, run context binding

---

### 4. Strategy Compliance Flow (ST-*)
**Status:** ✅ Implemented
**Purpose:** Enforce strategy selection and binding

**Detectors:**
- `detectLatchWithoutStrategy` — Verify latch has strategy selected
- `detectStrategyHeadShaMatch` — Verify strategy SHA matches current HEAD
- `detectMissingStrategyReceipt` — Verify strategy receipts exist

**Runnable:** Partial (detectors exist, not bundled in default audit)
**Coverage:** 3 checks
**Status:** Strategy selection, head SHA binding, receipt tracking

---

## Available Metaflow Commands

| Command | Status | Purpose | Requires Receipt |
|---------|--------|---------|------------------|
| `mf audit` | ✅ Runnable | Run compliance audit | No |
| `mf mine` | ❌ Not implemented | Extract mining data from runs | No |
| `mf init` | ❌ Not implemented | Initialize new metaflow | No |
| `mf wrap` | ❌ Not implemented | Wrap commands for metaflow | Yes |
| `mf ask` | ❌ Not implemented | Ask for human input in flow | Yes |
| `mf step` | ❌ Not implemented | Execute single flow step | Yes |
| `mf dispatch` | ❌ Not implemented | Dispatch work to team | No |
| `mf gantt` | ❌ Not implemented | Visualize timeline | No |
| `mf answer` | ❌ Not implemented | Record flow answers | No |
| `mf opt` | ❌ Not implemented | Optimize flow structure | No |

---

## Audit Contract (REQUIRED.json)

**Current Configuration:**
```json
{
  "schema_version": 1,
  "version": "1.0.0",
  "thresholds": {
    "latencyP95MaxMs": 5000,
    "toolCallInflationMax": 10,
    "orientChurnMax": 3
  },
  "requiredDetectors": [
    "RD-001","RD-002","RD-003",  // Regression Detection (3)
    "IR-001","IR-002","IR-003","IR-004","IR-005",  // Integration Reports (5)
    "PE-001","PE-002",  // Performance (2)
    "MF-001","MF-002","MF-003","MF-004","MF-005"  // Metaflow (5)
  ],
  "requiredTerminalNodeId": "intent-metaflow-audit-required",
  "bindFields": ["treeSha", "sessionIds", "runId"]
}
```

**Coverage:** 15 required detectors
**Gaps:** Strategy compliance not required, no state coherence checks

---

## Enforcement Gaps & Issues

### 🔴 Critical Gaps

1. **Mining Layer Not Accessible**
   - `mf mine` command not implemented
   - Cannot extract execution traces, latency, tool call patterns from runs
   - **Impact:** Integration flow cannot analyze friction/hotspots
   - **Solution:** Implement mining extraction from completed runs

2. **Strategy Compliance Not Enforced**
   - Strategy detectors (ST-*) exist but not in REQUIRED.json
   - No enforcement of strategy selection before complete
   - **Impact:** Swarm work without strategy contracts
   - **Solution:** Add strategy detectors to requiredDetectors

3. **State Coherence Not Validated**
   - No detector for state machine transition consistency
   - REQUIRED.json missing coherence SLO checks
   - **Impact:** Concurrent work may violate state contracts
   - **Solution:** Add `ST-004` detectStateMutationOrder detector

### 🟠 High-Priority Gaps

4. **Flow Registry Empty**
   - `.roadmap/flows/INDEX.json` doesn't exist
   - No metaflows can be executed via `mf` commands
   - **Impact:** Flow composition not available
   - **Solution:** Create flows directory and define flows for audit, recovery, optimization

5. **Performance Thresholds Not Strict**
   - P95 latency threshold: 5000ms (very loose)
   - Tool call inflation: 10x multiplier allowed
   - **Impact:** Performance regressions not caught
   - **Solution:** Tighten thresholds based on iter2 baselines (p99: 900ms, inflation: 2x)

6. **No Error Recovery Flows**
   - No metaflow for graceful error handling
   - No repair workflows defined as flows
   - **Impact:** Manual recovery when audits fail
   - **Solution:** Create `recovery-flow` and `repair-flow` compositions

7. **Active Run Not Tracked**
   - `.roadmap/metaflow/active-run.json` not automatically maintained
   - MF-003 (detectActiveRunNotPrinted) may always pass vacuously
   - **Impact:** Run context invisible to users
   - **Solution:** Implement run lifecycle in metaflow state management

### 🟡 Medium-Priority Gaps

8. **No Concurrent Flow Coordination**
   - Flows don't handle parallel node execution
   - No locking mechanism for shared state across flows
   - **Impact:** Concurrent flows may race on state
   - **Solution:** Add `MF-006` detectConcurrentFlowRaces detector

9. **No Flow Composition Primitives**
   - Flows are flat, not nested
   - No reusable sub-flows or flow templates
   - **Impact:** Code duplication across flows
   - **Solution:** Add `FlowComposition` type with `subflows` field

10. **Missing Display Flow Assertions**
    - Display audit detects regressions but doesn't verify content correctness
    - No assertion on specific output patterns
    - **Impact:** Output may be syntactically correct but semantically wrong
    - **Solution:** Add `DS-005` detectMetricsAccuracy detector

11. **No Latency Breakdown**
    - Performance detectors don't break down latency by command type
    - Can't identify slow commands
    - **Impact:** Can't optimize effectively
    - **Solution:** Add `PE-003` detectSlowCommandBreakdown detector

---

## Recommended New Metaflows

### Priority 1: Core Enforcement

#### Flow 1: `audit-recovery-flow`
**Purpose:** Run audit + auto-repair failures
**Steps:**
1. Run audit (display + integration + metaflow compliance)
2. Detect failures
3. Apply recovery strategies (graceful degrade, retry, repair)
4. Re-run validation
5. Report results with remediation

**Composition:**
```json
{
  "id": "audit-recovery-flow",
  "desc": "Audit with automatic recovery",
  "stageMin": 0,
  "stageMax": 10,
  "steps": [
    {"id": "step-1", "cmd": "roadmap mf audit", "produces": ["audit-report.json"]},
    {"id": "step-2", "cmd": "roadmap mf recovery", "consumes": ["audit-report.json"], "produces": ["recovery-log.json"]},
    {"id": "step-3", "cmd": "roadmap mf audit", "consumes": ["recovery-log.json"], "produces": ["audit-report-final.json"]}
  ]
}
```

---

#### Flow 2: `state-coherence-flow`
**Purpose:** Validate state machine transitions across all nodes
**Steps:**
1. Load all state transitions from audit trail
2. Verify legal transition sequences
3. Detect deadlocks or cycles
4. Validate concurrent operation ordering
5. Report coherence score

**Detectors to Add:**
- `MF-006` detectConcurrentFlowRaces
- `ST-004` detectStateMutationOrder
- `ST-005` detectDeadlocks

---

#### Flow 3: `performance-hardening-flow`
**Purpose:** Profile and optimize performance regressions
**Steps:**
1. Mine latency data from previous runs
2. Compute p50/p95/p99 latencies by command
3. Detect regressions vs baseline
4. Identify slow commands
5. Generate optimization proposals

**Metrics:**
- P95 latency (target: 1000ms per iter2)
- Tool call inflation (target: 2x)
- Orient churn (target: 1 per batch)

---

### Priority 2: Integration & Coordination

#### Flow 4: `swarm-coordination-flow`
**Purpose:** Coordinate parallel agent execution with metaflow
**Steps:**
1. Initialize metaflow run with strategy
2. Dispatch agents to nodes
3. Monitor concurrent execution
4. Detect race conditions
5. Collect mining data
6. Report coherence metrics

**Requires:** Active run tracking, concurrent flow detection

---

#### Flow 5: `mining-extraction-flow`
**Purpose:** Extract and aggregate mining data from completed runs
**Steps:**
1. Scan all run directories
2. Extract latencies, tool calls, errors
3. Build execution traces
4. Identify hotspots
5. Generate mining report

**Produces:** Mining data for friction analysis

---

### Priority 3: Advanced Features

#### Flow 6: `spec-conformance-flow`
**Purpose:** Validate DAG against spec-kit schemas
**Steps:**
1. Load spec from `.specify/spec.md`
2. For each scenario in spec:
   - Map to DAG node(s)
   - Run node validators
   - Verify spec compliance
3. Report coverage + gaps

---

#### Flow 7: `intent-convergence-flow`
**Purpose:** Validate intent-driven DAG changes
**Steps:**
1. Read session intent from trail
2. Extract user's stated goal
3. Compare against DAG structure
4. Detect scope creep or deviation
5. Report alignment score

---

## Composition Recommendations

### Composition 1: `verify-iteration-ready`
**Purpose:** Pre-iteration validation before execution
**Flows:**
1. `audit-recovery-flow` — Ensure no compliance issues
2. `state-coherence-flow` — Verify state machine
3. `performance-hardening-flow` — Check latency targets
4. Report overall readiness: PASS/FAIL

**Use Case:** Before `roadmap advance` or iteration start

---

### Composition 2: `post-execution-hardening`
**Purpose:** After batch/iteration completion
**Flows:**
1. `mining-extraction-flow` — Extract execution metrics
2. `spec-conformance-flow` — Verify spec compliance
3. `intent-convergence-flow` — Check alignment
4. `audit-recovery-flow` — Final validation
5. Generate hardening report

**Use Case:** After `roadmap complete` before `roadmap advance`

---

### Composition 3: `swarm-health-check`
**Purpose:** Monitor multi-agent execution health
**Flows:**
1. `swarm-coordination-flow` — Active work status
2. `state-coherence-flow` — Concurrent safety
3. `performance-hardening-flow` — Latency check
4. Alert if any SLO violated

**Use Case:** Continuous monitoring during swarm execution

---

## Implementation Roadmap

### Phase 1: Critical Path (Iter3)
- [ ] Implement `mf mine` command (mining extraction)
- [ ] Add strategy detectors to REQUIRED.json
- [ ] Implement `ST-004` detectStateMutationOrder
- [ ] Create `.roadmap/flows/INDEX.json`
- [ ] Define `audit-recovery-flow` and `state-coherence-flow`

### Phase 2: Integration (Iter4)
- [ ] Implement `swarm-coordination-flow`
- [ ] Add active run tracking
- [ ] Implement `MF-006` detectConcurrentFlowRaces
- [ ] Define `performance-hardening-flow`
- [ ] Create `verify-iteration-ready` composition

### Phase 3: Advanced (Iter5+)
- [ ] Implement remaining flows (mining, spec, intent)
- [ ] Create all compositions
- [ ] Add flow composition primitives
- [ ] Implement flow nesting/templates

---

## Enforcement Points

**Where Metaflows Should Enforce:**

| Enforcement Point | Detector(s) | Action |
|------------------|-----------|--------|
| Before `roadmap complete` | MF-001..005 + ST-* | Block if compliance fails |
| Before `roadmap advance` | All required + performance | Warn if SLO at risk |
| During swarm work | MF-006 + ST-004 + ST-005 | Monitor for violations |
| Post-batch | Mining + spec + intent | Report gaps |

---

## Metrics & SLOs for Metaflows

**Audit SLOs:**
- P95 latency: 5000ms → **Target: 1500ms** (iter2 p99=900ms + buffer)
- Tool call inflation: 10x → **Target: 2x** (realistic overhead)
- Orient churn: 3 → **Target: 1** (one per batch)

**Coherence SLOs:**
- State transition violations: 0 (hard requirement)
- Race condition detections: 0 (hard requirement)
- Deadlock detections: 0 (hard requirement)

**Performance SLOs:**
- Latency p99: 1000ms (per iter2)
- Error rate: < 1%
- Recovery rate: > 95%

---

## Summary

**Current Status:**
- ✅ 4 audit flows defined (display, integration, metaflow, strategy)
- ⚠️ Only `mf audit` command partially implemented
- ❌ Flow registry empty, no flows runnable
- ❌ Mining layer not accessible
- ❌ 11 enforcement gaps identified

**Ready to Run:**
- `roadmap mf audit` — Display + integration audit

**Recommended First Implementation:**
1. Enable mining extraction
2. Add strategy enforcement
3. Define core flows
4. Implement `verify-iteration-ready` composition

**Critical for Iter3:**
1. Mining flow (MF execution analysis)
2. State coherence detection (concurrent safety)
3. Performance baselines (latency SLOs)
