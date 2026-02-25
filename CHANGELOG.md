# Changelog

## [0.2.0] - 2026-02-25

### Added
- **merge(g1, g2, connections)**: Combine DAGs at join points. Multi-phase roadmaps + recursive expansion.
- **branch(g, fromNode)**: Extract variant DAG. Parallel development + regression testing.
- Documentation: SKILL.md guide, README.md with examples, 4 decision records.
- Consumer example: example/simple-project-roadmap.ts
- 4 new test suites: adv-merge (7), adv-property (17), adv-branch (5), consumer-integration (6)

### Fixed
- reconcile() gap.missing: unmet consumes only (no surplus produces)
- orient() empty-produces stall: gates marked done, position advances
- orient() partition invariant: g.term filtered from done

### Tests
- 88/88 passing (was 37)
- 0 tsc errors
- roadmap.ts self-validates

## [0.1.0] - 2026-02-25

### Initial release
- Core: define, check, verify, order, orient, reconcile
- Type-safe node construction
- Cycle detection + reachability + contract validation
- Adversarial specs for two critical bugs
- Self-referential roadmap
