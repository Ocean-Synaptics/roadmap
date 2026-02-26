# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-26

### Added

- **Protocol Core**: Full DAG specification and validation
  - `define()` — validate graph structure (acyclic, init↔term reachable)
  - `verify()` — validate artifact consumption contracts
  - `check()` — verify connectivity (init reaches term, no orphans)
  - `order()` — topological sort for execution sequence
  - `parallelOrder()` — batched topological sort for concurrent execution

- **Graph Operations**
  - `orient()` — find execution position from filesystem state
  - `reconcile()` — identify where forward.produces meets backward.consumes
  - `merge()` — combine two DAGs at join points (multi-phase pipelines)
  - `branch()` — extract subgraph from node to terminal (recovery, partial builds)

- **Predicates**
  - `fileExists()` — artifact existence check (filesystem)
  - `siblingArtifactExists()` — check sibling repo artifacts (workspace pattern)
  - `gitArtifactAt()` — check artifact at git ref (checkpoint pattern)
  - `any()` — combine predicates with OR logic

- **Design Decisions**
  - `docs/decisions/reconcile-gap.md` — gap.missing semantics (unmet demand only)
  - `docs/decisions/orient-empty-produces.md` — gate node advancement
  - `docs/decisions/merge-design.md` — combining DAGs at join points
  - `docs/decisions/branch-design.md` — subgraph extraction and recovery

- **Documentation**
  - `README.md` — project overview, quick start, examples
  - `SKILL.md` — comprehensive API reference and workflow guide
  - `example/simple-project-roadmap.ts` — annotated example DAG
  - `example/test.ts` — workflow examples (orient, merge, branch)

- **Testing**
  - Adversarial spec tests for all core protocols
  - Consumer integration test (smoke test for real projects)
  - Property-based tests for DAG manipulation

- **CLI**
  - `bin/roadmap orient` — find position and orientation
  - `bin/roadmap chart` — display project status
  - `bin/roadmap validate` — check DAG structure
  - `bin/roadmap parallel` — show concurrent execution groups
  - `bin/roadmap trail` — view execution history

### Fixed

- **orient() empty-produces**: Gate nodes (produces:[]) now correctly marked as trivially done
  - Before: nodes with no artifacts would stall forever
  - After: `!node.produces.length || node.produces.every(exists)`

- **reconcile() gap.missing**: Gap now contains unmet demand only
  - Before: included both surplus produces and unmet consumes
  - After: missing = bn.consumes.filter(c => !fn.produces.includes(c))

## [0.1.0] - 2026-01-15

### Added

- Initial project scaffold
- Package structure and TypeScript configuration
- Basic type definitions for Graph, NodeSpec, Orientation

---

## Upgrade Guide

### 0.1.0 → 0.2.0

**Breaking Changes**: None (v0.1.0 was internal)

**New APIs**:
- All core protocol functions: `define()`, `verify()`, `orient()`, `reconcile()`, `merge()`, `branch()`
- All predicate builders: `fileExists()`, `siblingArtifactExists()`, `gitArtifactAt()`, `any()`
- CLI interface with commands: `orient`, `chart`, `validate`, `parallel`, `trail`

**Migration**: No migration needed; this is the first public release.

---

## Planned (Upcoming)

### Phase 4: Agent Integration
- `roadmap/agent` — sealed agent API
- `getBrief()`, `advance()`, `checkpoint()`
- Regent enforcement integration

### Phase 5: Recovery & Audit
- `CheckpointManager` — session state management
- `AuditTrail` — execution history tracking
- Rollback and recovery workflows

### Phase 6: Versioning
- DAG versioning and migrations
- `loadDAG()` with compatibility checks
- Schema evolution support

### Phase 7+: Adoption
- Auto-integration generation
- Multi-repo coordination
- Adoption scenario validation
