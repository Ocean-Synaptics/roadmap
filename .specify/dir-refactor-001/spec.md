# Specification: dir-refactor-001

**Title**: Directory & File Size Reorganization

**Scope**: Restructure src/ to enforce max 10 files/dir and 400 lines/file

---

## Acceptance Scenarios

### Scenario 1: src/lib Directory Structure Reorganized

**Given** src/lib has 109 files across multiple domains
**When** refactoring is complete
**Then**:
- src/lib has ≤ 10 files (core exports only)
- All domains are organized into semantic subdirectories:
  - src/lib/protocol/ (DAG, types, validation)
  - src/lib/audit/ (audit engine, analysis)
  - src/lib/claims/ (rendering, detectors)
  - src/lib/evidence/ (collection, schema)
  - src/lib/intent/ (expansion, binding, gates)
  - src/lib/metaloop/ (orchestration, wiring)
  - src/lib/metaflow/ (phases, state)
  - src/lib/render/ (templates, output)
  - src/lib/intake/ (import, parsing)
  - src/lib/completion/ (tracking, storage)
  - src/lib/recipes/ (proposal, merge, patch, overlay)
  - src/lib/exploration/ (helpers, interactions)
  - src/lib/strategies/ (specialization)
  - src/lib/config/ (kernel, rate-card, enforcement)
  - src/lib/utils/ (git, cluster, federation, etc.)
- Barrel exports in src/lib/index.ts maintain existing import paths
- No import errors or breakage

### Scenario 2: Large Files Are Split Into Focused Modules

**Given** files like protocol.ts (~800 lines), intent-expansion.ts (~600 lines)
**When** refactoring is complete
**Then**:
- All code files have ≤ 400 lines
- Large files are split by concern:
  - protocol.ts → protocol/types.ts, protocol/validation.ts, protocol/operations.ts
  - intent-expansion.ts → intent/expansion/detection.ts, intent/expansion/gaps.ts, intent/expansion/proposals.ts
- Each split module has a clear, single responsibility
- No duplication of code
- Imports between split modules work correctly

### Scenario 3: Tests Pass After Reorganization

**Given** the full refactoring is complete
**When** running the test suite
**Then**:
- npm run test -- tests/ passes with all tests green
- npm run tsc -- --noEmit passes (no type errors)
- No import resolution errors
- No broken module references

### Scenario 4: Iterative Refactoring With Verification

**Given** multiple domains need reorganization
**When** executing refactoring in phases
**Then**:
- Each phase reorganizes one domain (audit, protocol, intent, etc.)
- After each phase: tests pass, no import errors
- Commits are atomic per domain
- Git history is clean and reviewable

### Scenario 5: All Directories Meet Size Constraints

**Given** refactoring is complete
**When** running structural audit
**Then**:
- Every src/* directory has ≤ 10 files
- Every src/**/* directory has ≤ 10 files (recursively)
- Every code file (*.ts) has ≤ 400 lines
- Exceptions documented (data files, schema files, generated files)

### Scenario 6: Import Paths Remain Stable

**Given** existing code imports from src/lib/*
**When** refactoring reorganizes files to subdirectories
**Then**:
- Imports from src/lib/XXX still work (barrel exports in subdirectories)
- Imports from src/lib/XXX/yyy.ts work (direct imports optional)
- No need to update existing import statements in consuming code
- Migration can be gradual (old paths work during transition)

### Scenario 7: Domain Semantics Are Clear

**Given** the reorganized structure
**When** reviewing the directory tree
**Then**:
- Each directory has a clear, single purpose
- Related files are grouped together
- File naming follows conventions within each domain
- README or index comments explain each domain

### Scenario 8: No Code Deletion, Only Reorganization

**Given** refactoring task
**When** executing all moves and splits
**Then**:
- No code is deleted
- All functionality is preserved
- All tests pass (same test coverage)
- No regression in behavior

---

## Acceptance Criteria (Definition of Done)

- [ ] Directory audit complete: identify all files and their domains
- [ ] File size audit complete: identify all files exceeding 400 lines
- [ ] Reorganization plan created with specific move/split instructions
- [ ] All large files split according to plan
- [ ] All files moved to appropriate semantic directories
- [ ] Barrel exports created to maintain backward compatibility
- [ ] All imports updated and verified
- [ ] Tests pass: npm run test -- tests/
- [ ] TypeScript checks pass: npm run tsc -- --noEmit
- [ ] Structural audit passes: no dir > 10 files, no file > 400 lines
- [ ] Git history is clean: one commit per phase
- [ ] Documentation updated (comments/headers explaining new structure)

---

## Technical Constraints

**File Size Limits**:
- Code files: ≤ 400 lines
- Exceptions: *.schema.ts, *.receipt.json, generated files (marked in comments)
- Measure: actual source code lines (exclude comments/blank lines? — count all lines)

**Directory Depth**:
- Prefer flat structure (src/lib/XXX/) over deep nesting
- Max depth: src/lib/domain/subdomain/ (3 levels from src/lib)
- Reason: avoid deep import paths and complex navigation

**Semantic Organization**:
- Group by domain (protocol, audit, intent) not by file type (.ts, .test.ts)
- Each domain owns its types, logic, and tests
- Cross-domain imports allowed, but favor composition over coupling

**Backward Compatibility**:
- Existing import paths should still work
- Use barrel exports (index.ts) in each directory
- No renames of exported identities
- Migration path for any breaking changes

---

## Exclusions

**Out of Scope**:
- Renaming exports or functions (structure only)
- Refactoring internal logic (except as necessary for splitting)
- Adding new features or tests
- Changing test file locations (keep tests near code)

---

## Related Issues & Context

- **Previous Audit**: commit bc2ab88 analyzed src/lib structure (213 files)
- **Evidence Kernel**: commit 76ae65f (FR-META-EVID-001) added evidence layer
- **Principle**: "No directory > 10 files, no file > 400 lines" keeps code navigable
