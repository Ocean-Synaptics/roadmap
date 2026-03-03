# Branch Architecture

## Main Branches

### `main` (Canonical)
- Read-only with branch protections enabled
- All production code and decisions live here
- Enforced via pre-commit hooks and GitHub branch rules
- Immutable history for audit trails

### `archive/full-codebase` (Snapshot)
- Created at hardening-001 baseline
- Preserves full codebase before tree-shake
- Immutable reference for recovery and compliance
- Used for historical context and validation

### `develop` (Experimental)
- Optional development branch
- Can be force-pushed for experimentation
- Not required for mainline execution
- Useful for feature branches

## Workflow

1. **Feature branches** (`feat/*`, `wip/*`) branch from `main`
2. **Edits to head.json** only allowed on feature branches
3. **Pre-commit hook** prevents DAG edits on main
4. **Merge consolidates** multiple DAG changes into unified head.json
5. **PR review** required before merging to main

## Enforcement

- GitHub branch protections: main is immutable
- Pre-commit hooks: DAG integrity on feature branches
- gitsafe loader: file access validation at CLI level
- Audit trail: all operations logged to trail.jsonl
