# Specification: FR-RM-PROCESS-010 — Metaflow Audit as Required Terminal

## Specification

### Plan clarity validated against feature spec

**Given** FR-RM-PROCESS-010 defines 9 nodes with audit engine, display/integration detectors, completion autocommit, import gate, CLI, opt-map, and terminal intent
**When** implementation begins at rm-audit-contract
**Then** all nodes are unambiguous, zero-question executable, and the DAG terminates at `intent-metaflow-audit-required` with a passing audit receipt

See: `.specify/specs/fr-rm-process-010/tasks.md` — authoritative node list, produces, validates, acceptance criteria.
