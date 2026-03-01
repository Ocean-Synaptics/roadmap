# Tasks: dir-refactor-001

Decomposed into phases for roadmap DAG import.

---

## Phase 1: Audit & Planning

### audit-directory-structure
Scan src/ and identify:
- Directory file counts
- Files exceeding 400 lines
- Current semantic grouping (if any)
- Import dependencies between files

**Produces**: audit-report.json (directories, file sizes, domains)

### audit-file-sizes
Detailed line count for all .ts files in src/

**Produces**: file-sizes.json (filename → line count)

### plan-reorganization
Use audits to create reorganization plan:
- Where each file should go
- Which files need splitting
- How to split large files
- New barrel exports needed

**Produces**: reorganization-plan.json (file → target path, split instructions)

---

## Phase 2: Core Infrastructure Reorganization

### reorganize-protocol-layer
Move and split protocol-related files:
- src/lib/protocol.ts → src/lib/protocol/{types, validation, operations}.ts
- src/lib/schema.ts → src/lib/protocol/schema.ts
- src/lib/types.ts → src/lib/protocol/types.ts
- Create src/lib/protocol/index.ts (barrel export)

**Validates**: No breaking imports, tests pass

### reorganize-core-layer
Move core DAG and execution files:
- src/lib/index.ts → stays but updated
- src/lib/core/*.ts organized
- Create src/lib/core/index.ts

**Validates**: Tests pass

### reorganize-utils-layer
Group utility modules:
- git.ts, git-index.ts
- cluster.ts, cluster-solver.ts
- dependency-resolver.ts
- federation.ts
- token-*.ts
Move to src/lib/utils/{git, cluster, federation, tokens}/

**Validates**: No import errors

---

## Phase 3: Domain Layer Reorganization (Parallel)

### organize-audit-domain
Group audit-related files:
- audit.ts, audit-ingest.ts, audit-recommend.ts, audit/
- Move to src/lib/audit/

**Validates**: Tests for audit/* pass

### organize-evidence-domain
Ensure evidence/ is properly structured:
- Already organized (schema, collect, etc.)
- Verify ≤ 10 files
- Add barrel export if missing

**Validates**: Tests for evidence/* pass

### organize-claims-domain
Group claims-related files:
- claims.ts, claims/
- Move to src/lib/claims/

**Validates**: Tests for claims/* pass

### organize-intent-domain
Group intent-related files:
- intent-*.ts, intent/ subdir
- Split large files (intent-expansion.ts)
- Move to src/lib/intent/

**Validates**: Tests for intent/* pass

### organize-metaloop-domain
Group metaloop-related files:
- metaloop/ subdir
- transcript-schema.ts → metaloop/schema.ts
- Move to src/lib/metaloop/

**Validates**: Tests for metaloop/* pass

### organize-metaflow-domain
Group metaflow-related files:
- metaflow/ subdir (23 files currently)
- Split large files if needed
- Organize by phase or responsibility

**Validates**: Tests for metaflow/* pass

### organize-render-domain
Group render-related files:
- render/ subdir (11 files)
- Move helper modules
- Organize templates, output generation

**Validates**: Tests for render/* pass

### organize-intake-domain
Group intake-related files:
- intake-*.ts, intake/ subdir
- Move to src/lib/intake/

**Validates**: Tests for intake/* pass

### organize-completion-domain
Verify completion/ structure:
- completion/ already exists
- Verify ≤ 10 files
- Move completion-evidence.ts if needed

**Validates**: Tests for completion/* pass

### organize-recipes-domain
Group recipe/instruction files:
- proposal-gen.ts → recipes/proposal.ts
- dispatch.ts → recipes/dispatch.ts
- merge-gate.ts → recipes/merge.ts
- patch-stack.ts → recipes/patch.ts
- plan-gate.ts → recipes/plan.ts
- overlay.ts → recipes/overlay.ts
Move to src/lib/recipes/{proposal, dispatch, merge, patch, plan, overlay}/

**Validates**: No import errors

### organize-exploration-domain
Group exploration-related files:
- explore-helpers.ts, explore-interactions.ts, runtime-explore.ts
- Move to src/lib/exploration/

**Validates**: Tests pass

### organize-strategies-domain
Group strategy-related files:
- sgk/ subdir
- strategies/ subdir
- strategy/ subdir
- strategy-overlay.ts
Move to src/lib/strategies/ or consolidate

**Validates**: No import errors

### organize-config-domain
Group configuration files:
- kernel-config.ts, kernel-enforcement.ts
- rate-card.ts
- Move to src/lib/config/

**Validates**: No import errors

---

## Phase 4: Split Large Files

### split-protocol-ts
If protocol.ts > 400 lines:
- Extract types → protocol/types.ts
- Extract validation → protocol/validation.ts
- Extract operations → protocol/operations.ts
- Update imports

**Validates**: Tests pass, all files ≤ 400 lines

### split-intent-expansion-ts
If intent-expansion.ts > 400 lines:
- Extract detection → intent/expansion/detection.ts
- Extract gaps → intent/expansion/gaps.ts
- Extract proposals → intent/expansion/proposals.ts
- Update imports

**Validates**: Tests pass

### split-metaflow-orchestrator
If metaflow/orchestrator.ts > 400 lines:
- Split by phase: init, detect, expand, execute
- Or split by concern: state, transitions, execution
- Create metaflow/{phase,concern}/*.ts

**Validates**: Tests pass

### split-other-large-files
Identify and split any remaining files > 400 lines:
- For each file, determine split strategy
- Create separate task per file
- Update imports

**Validates**: Tests pass, no file > 400 lines

---

## Phase 5: Verification & Cleanup

### verify-structure
Run structural audit:
- Check no directory > 10 files
- Check no file > 400 lines
- List exceptions (data, schema, generated)

**Produces**: structure-audit.json

### verify-imports
Run import audit:
- Check all imports resolve correctly
- Check no circular dependencies
- Check barrel exports working

**Produces**: import-audit.json

### verify-tests
Run full test suite:
- npm run test -- tests/
- npm run tsc -- --noEmit
- Report any failures

**Produces**: test-results.json

### clean-up-documentation
Update comments and headers:
- Each directory/file explains its purpose
- Cross-domain boundaries documented
- Migration notes if applicable

**Produces**: Updated code headers and comments

### create-structure-guide
Document new structure:
- Directory tree with explanations
- File organization principles
- Import guidelines
- How to add new files

**Produces**: STRUCTURE.md

---

## Acceptance Gates

- [ ] All 4 phase 2 nodes complete
- [ ] All 12 phase 3 nodes complete (parallel)
- [ ] All phase 4 nodes complete
- [ ] All phase 5 nodes complete
- [ ] Structure audit passes: 0 dirs > 10 files, 0 files > 400 lines
- [ ] Test audit passes: all tests green
- [ ] Import audit passes: no errors
- [ ] Documentation complete

---

## Import Notes

Use `roadmap import --from speckit dir-refactor-001 --id dir-refactor-001` to convert these tasks to a roadmap DAG.

Recommended structure:
- L0: audit-directory-structure, audit-file-sizes (parallel)
- L1: plan-reorganization
- L2: reorganize-protocol, reorganize-core, reorganize-utils (parallel)
- L3: organize-* (all 12 in parallel, 1 per domain)
- L4: split-* (all parallel)
- L5: verify-*, clean-up, create-guide (parallel)
