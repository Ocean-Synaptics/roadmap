# dir-refactor-001: Directory & File Size Reorganization

## Problem Statement

Two related structural issues:

### Directory Bloat
Directories exceed healthy file count limits:
- **src/lib**: 109 files (should be ≤ 10)
- **src**: 26 files (should be ≤ 10)
- **src/lib/metaflow**: 23 files (should be ≤ 10)
- **src/lib/render**: 11 files (should be ≤ 10)

### File Size Bloat
Code files exceed healthy line count limits:
- Files should be ≤ 400 lines (exceptions: data files, compiled output)
- Large files are harder to navigate, test, and reason about
- Need to split oversized modules into focused, testable units

## Goal

Reorganize the codebase so:
1. **Every directory has ≤ 10 files** (semantic grouping by domain/layer)
2. **Every code file has ≤ 400 lines** (focused, testable modules)

## Success Criteria

1. **Directory structure**: Every src/* directory has ≤ 10 files
2. **File size**: Every code file has ≤ 400 lines (exceptions: data/compiled files)
3. **No broken imports**: All existing code paths work
4. **Tests pass**: Full test suite runs without errors
5. **Semantic organization**: New structure reflects domain boundaries (auth, audit, protocol, intent, etc.)
6. **Focused modules**: Large files split into focused, testable units with clear responsibility

## Constraints

- Preserve all functionality
- No deletion of code (only reorganization)
- Maintain existing import paths where possible, use barrel exports
- Document reorganization in comments/headers
- Keep git history clean (one commit per reorganized domain)

## Key Directories & File Counts

| Directory | Current | Target | Strategy |
|-----------|---------|--------|----------|
| src/lib | 109 | 10 | Split into domain subdirs: audit, claims, evidence, intent, metaloop, protocol, etc. |
| src | 26 | 10 | Move CLI to src/cli, configs to src/config, bin already separate |
| src/lib/metaflow | 23 | 10 | Split into phases (init, detect, expand, etc.) or by role |
| src/lib/render | 11 | 10 | Move helper modules to separate dirs |
| src/lib/completion | 4 | — | Already OK, but verify grouping |
| src/lib/evidence | 3 | — | Already OK |

## Key Files & Line Counts

Files exceeding 400 lines require splitting:

| File | Lines | Strategy |
|------|-------|----------|
| src/lib/protocol.ts | ~800+ | Split by concern: types, validation, operations |
| src/lib/intent-expansion.ts | ~600+ | Split: detection, gap extraction, proposals |
| src/lib/metaflow/orchestrator.ts | ~500+ | Split: phases, state machine, transitions |
| src/lib/render/*.ts | Various | Check each and split as needed |
| src/lib/metaloop/*.ts | Various | Check each and split |
| Others (TBD) | TBD | Identify during audit phase |

Exceptions (do NOT split):
- Data/schema files (e.g., `.schema.ts`, `.receipt.json`)
- Generated/compiled files (e.g., auto-generated code)
- Type definition files where split doesn't make sense

## Semantic Domains Identified

From code audit, these natural domains emerge:

- **protocol**: core DAG + types (protocol.ts, schema.ts, types.ts, index.ts)
- **audit**: audit-*.ts, audit/ subdir
- **claims**: claims.ts, claims/ subdir
- **evidence**: evidence/ subdir, completion-evidence.ts
- **intent**: intent-*.ts, intent/ subdir
- **metaloop**: metaloop/ subdir, transcript-schema.ts
- **metaflow**: metaflow/ subdir
- **render**: render/ subdir
- **completion**: completion/ subdir
- **intake**: intake-*.ts, intake/ subdir
- **recipes**: proposal, dispatch, merge-gate, plan-gate, patch-stack, overlay
- **exploration**: explore-helpers.ts, explore-interactions.ts, runtime-explore.ts
- **specialization**: sgk/ subdir, strategies/ subdir, strategy/ subdir, strategy-overlay.ts
- **config**: kernel-config.ts, rate-card.ts, kernel-enforcement.ts, layout-apply.receipt.json
- **utilities**: git.ts, git-index.ts, cluster.ts, cluster-solver.ts, dependency-resolver.ts, federation.ts, etc.

## Approach

**Phase 1 (audit)**: Identify file → domain mapping
**Phase 2 (plan)**: Decide exact directory structure
**Phase 3 (execute)**: Move files, update imports, verify tests
**Phase 4 (validate)**: Confirm all directories ≤ 10 files

This is iterative: reorganize one domain at a time, test after each move, refine.

## Out of Scope

- Renaming files
- Renaming exports
- Refactoring internal logic
- Adding new features
- Changing test structure (just reorganize with code)

## Success Metrics

**Structural**:
- ✅ Zero directories with > 10 files
- ✅ Zero code files with > 400 lines (exceptions: data/compiled files)

**Functional**:
- ✅ Tests all passing
- ✅ No import errors
- ✅ All TypeScript checks pass

**Quality**:
- ✅ Code is more navigable (clearer domains)
- ✅ Modules are more focused (single responsibility)
- ✅ Easier to test individual components

## Related Work

- Previous audit: `bc2ab88` (src/lib audit, 213 files analyzed)
- Evidence kernel: `76ae65f` (FR-META-EVID-001 complete)
