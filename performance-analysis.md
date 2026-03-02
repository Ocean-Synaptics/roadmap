# Performance Analysis: Scaling Self-Improvement DAG to 50 Concurrent Agents

**Date**: 2026-03-02
**Profile Version**: Load Test Strategy
**Status**: Analysis of bottleneck hypotheses and prioritized mitigations

## Executive Summary

The performance profile identifies three critical scaling scenarios for the self-improvement DAG orchestrator. Current baseline supports 25 concurrent agents at 100% success rate. Scaling to 50 agents is constrained by contention on shared resources (git worktrees, completion records, brief generation) rather than computation. The analysis recommends prioritized interventions addressing sequential bottlenecks in order of expected impact.

## Current State

- **Baseline**: 25 agents, 100% success, working reliably
- **Target**: 50 agents (2x capacity)
- **Load profile**: 50 concurrent agents × 2 nodes/agent = 100 total nodes
- **Duration**: ~30 minutes for full load test

## Identified Bottlenecks

### 1. Git Worktree Creation (O(n) Disk I/O)
**Severity**: HIGH
**Impact**: Agent startup latency
**Root cause**: Sequential worktree creation via shell subprocess calls. Each `git worktree add` is a synchronous disk operation; 50 agents × 2 nodes = 100+ operations serialized by orchestrator dispatch loop.

**Evidence**: Bottleneck identified in scaling hypothesis; not yet measured empirically.

**Mitigations**:
- Batch worktree creation with parallel shell execution (GNU parallel or Node worker threads)
- Pre-allocate worktree pools on startup (warm cache)
- Async git operations in background, brief assignment blocking only on directory existence check
- Consider tmpfs for intermediate artifacts if disk I/O dominates

### 2. Completion Record Writes (Concurrent JSON Updates)
**Severity**: HIGH
**Impact**: Batch advancement latency, orchestration stalls
**Root cause**: All agents write to shared `.roadmap/head.json` or centralized completion log on node finish. File locking contention if writes are serialized; corruption risk if concurrent writes aren't atomic.

**Evidence**: Identified as "database-like contention" in profile; likely manifests as 3x+ slowdown in sublinear scaling scenario.

**Mitigations**:
- Sharded completion store (one file per agent or per node, merged at validation)
- JSONL-append pattern (no locking, atomic per line)
- In-memory buffer with periodic batch flush (collect 10 completions, write once)
- Dedicated completion service (if remote orchestration is in scope)

### 3. Brief Generation and Caching
**Severity**: MEDIUM
**Impact**: Agent dispatch latency
**Root cause**: Brief may be regenerated per agent spawn (nodeSpec → Brief conversion) or cached inadequately. Repeated work if not memoized.

**Evidence**: Listed as "cached or regenerated" decision point in profile; no confirmation of caching strategy in current codebase.

**Mitigations**:
- Memoize brief generation by nodeId (LRU cache, cleared per DAG update)
- Pre-compute all briefs at DAG load time
- Lazy-load briefs on first agent assignment, cache in memory

### 4. Network I/O (If Distributed)
**Severity**: MEDIUM
**Impact**: Brief fetching, metrics reporting
**Root cause**: If agent orchestration is remote (separate machine/service), network latency compounds every agent spawn and handoff.

**Evidence**: Conditional in profile ("if remote execution"); check current architecture.

**Mitigations**:
- Keep orchestrator and agent pool on same machine (colocated)
- Batch brief delivery to agents (send 5 briefs in one request)
- Local completion cache before remote flush

## Expected Findings and Next Steps

### Scenario 1: Linear Scaling (50 agents take ~2x as long as 25)
**Implication**: Architecture handles parallelism well; bottleneck is compute-bound, not contention.
**Action**: Scale test to 100 agents. No immediate optimization needed beyond profiling.

### Scenario 2: Sublinear Scaling (50 agents take 3x+ as long as 25)
**Implication**: Contention bottleneck on shared resource. Expected: git operations or completion writes.
**Action**:
1. Profile to confirm bottleneck (CPU, disk I/O, file lock wait times)
2. Apply Mitigation #2 (completion record sharding) — highest expected ROI
3. Apply Mitigation #1 (batch worktree creation) — second-order impact
4. Re-test; if still sublinear, profile further

### Scenario 3: Hard Failure (>50 agents crash or timeout)
**Implication**: Resource limit hit (file descriptors, memory, process limit).
**Action**:
1. Identify which resource (ulimit, vmstat, lsof)
2. Increase OS limits or refactor architecture to pool resources
3. Re-test

## Metrics Collection Plan

Collect and correlate:
- **Agent spawn latency** (t_spawn): time from orchestrator dispatch to agent ready
- **Completion write latency** (t_completion): time from node finish to completion record durability
- **Total wall-clock time** (t_total): end-to-end for all agents
- **Resource utilization**: CPU%, memory/process, disk I/O (MB/s), file descriptor count
- **Contention indicators**: lock wait time, file system staleness, git command latency per operation

## Conclusion

Scaling from 25 to 50 agents is bounded by three resource contention points: git worktree creation, completion record writes, and brief generation. Prioritize empirical profiling to confirm which bottleneck dominates; apply mitigations in high-impact order (sharded completion records, batched worktrees, brief caching). Linear scaling is achievable with focused optimization; sublinear scenarios indicate architectural refactoring needed.

---

**Next milestone**: Execute 50-agent load test, collect metrics, run adversarial analysis to confirm bottleneck diagnosis. Then expand optimization roadmap based on empirical findings.
