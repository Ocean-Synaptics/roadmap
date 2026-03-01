# Handoff: FR-META-EVID-001 Ready for Implementation

**Date**: 2026-03-01
**Context**: Evidence-required enforcement (anti-hallucination gates) for metaspec/metaloop
**Status**: Roadmap ready, no changes committed, clean slate for next context
**Current HEAD**: `95a2252f510b8a2a218937be6520d3cb065f4e4d` (roadmap DAG commit)

---

## Problem Addressed

**Previous failure**: Metaspec transcript narrated 937 points of value, 26 commits, 45+ files changed—with **zero evidence backing**. Claims were synthetic; actual code changes were stubs, not refactoring.

**Root cause**: No mechanical enforcement that claims must be derived from observable repo state (git diffs, file reads, test results).

---

## Solution: FR-META-EVID-001

Kernel-level governance layer that makes evidence **mechanically mandatory**:

- **Evidence bundle**: JSON record (git diff, file reads, test results, checks)
- **Claim Renderer**: Refuses to emit summaries without evidence backing
- **Hard detectors**: `STUB_ONLY_CHANGESET`, `INSUFFICIENT_READ_PROOFS`, `NO_FAKE_PERF`
- **Terminal invariant**: Claims without evidence → blocked

---

## Roadmap Structure

**DAG**: `fr-meta-evid-001` (7 nodes, 4 levels)

```
L00: init-governance (current state)
L01: evidence-schema (EVIDENCE.json contract)
L02: evidence-collector, claim-renderer, terminal-intent-binding (parallel)
L03: metaloop-evidence-wiring, roadmap-verify-invariant (parallel)
L04: intent-evidence-kernel-active (terminal intent gate)
```

**Entry point**: `bin/roadmap orient --note "continue FR-META-EVID-001"`

---

## For Next Context

### Setup
```bash
cd /home/griffin/src/roadmap
git branch  # confirm on fr-surf-001
bin/roadmap chart  # verify roadmap visible
```

### Start work
```bash
bin/roadmap show evidence-schema  # read L01 node spec
# Implement src/lib/evidence/schema.ts + docs
bin/roadmap complete evidence-schema --note "..."
```

### Key files to create
- `src/lib/evidence/schema.ts` — TypeScript interface for EVIDENCE.json
- `src/lib/evidence/collect.ts` — collectEvidence() function
- `src/lib/claims/render.ts` — ClaimRenderer + detectors
- `src/lib/claims/detectors.ts` — `STUB_ONLY_CHANGESET`, `INSUFFICIENT_READ_PROOFS`, `NO_FAKE_PERF`
- `tests/evidence/*.test.ts` — unit tests
- `docs/evidence/EVIDENCE_CONTRACT.md` — spec documentation

### Validation
After each node:
```bash
npm run tsc -- --noEmit  # TypeScript check
npm run test  # run relevant tests
```

---

## Notes for Implementation

1. **No stub-only changes**: Each node must modify existing code or create code that solves a real problem. `evidence-collector` reads git state—it reads the real codebase, not mock data.

2. **Evidence is ground truth**: If you claim "collectors work", the evidence bundle itself is the proof (contains git diff, file reads, test results).

3. **Terminal gate is strict**: `intent-evidence-kernel-active` requires all 5 prior nodes complete + tests passing.

4. **This is governance, not a feature**: You're building the constraint layer that prevents future hallucination-style transcripts.

---

## Previous Work (Context)

Earlier in this session (now-archived transcript):
- Created FR-META-REFAC-001 spec-kit (metaspec for refactoring surveys)
- Attempted 3+ iterations of refactoring + custodial work (**synthetic**)
- User correctly identified: claims without evidence, stubs instead of real refactoring
- Outcome: This spec-kit (FR-META-EVID-001) as fix

---

## Resources

- **Spec document**: Embedded in roadmap commit message + this handoff
- **Related roadmaps** (archived):
  - `lib-refactor-001` (real src/lib refactoring, also needs evidence enforcement)
  - `fr-meta-refac-001` (metaspec template, now requires evidence layer)
- **Git trail**: All commits on `fr-surf-001` branch

---

## Resumption Checklist

- [ ] Read this handoff
- [ ] `bin/roadmap chart` to see roadmap
- [ ] `bin/roadmap show evidence-schema` to read first node
- [ ] Understand evidence schema (check EVIDENCE_CONTRACT.md spec in this file)
- [ ] Start implementing `evidence-schema` node
- [ ] Commit each node's work with `bin/roadmap complete <node-id>`
- [ ] When done: `bin/roadmap orient --check` to verify progress

---

**Ready for next context.**
