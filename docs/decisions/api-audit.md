# API Surface Audit

## Goal

Audit the roadmap library's public API to ensure it's complete, coherent, and maintainable. Identify:
- Necessary exports from each module
- Dead or redundant APIs
- Naming inconsistencies
- Missing or conflicting contracts

## Process

### 1. Gather Entry Points

Each module (`protocol`, `recovery`, `validation`, etc.) claims exports via file headers (`@exports` tag).
Verify what's actually exported vs. declared.

```typescript
// @module recovery
// @exports CheckpointManager, AuditTrail, ...
// @entry roadmap/recovery
```

### 2. Measure Usage

For each exported symbol:
- Count imports across src/, tests/, bin/, examples
- Check if used in public API surface (e.g., user-facing CLI)
- Identify internal-only helpers

### 3. Check Contracts

For each function/type:
- Does signature match usage?
- Are error conditions documented?
- Is idempotency clear?

Example issue: `reconcile(g, fwd, bwd)` — is backwards graph really needed, or can it be derived?

### 4. Normalize Naming

Audit for consistency:
- Verb-noun pattern: `validateGraph` vs. `graphValidate`
- Result types: `ValidationResult` vs. `Result` vs. `{errors, warnings}`
- Plural vs. singular: `nodes` vs. `nodeSpecs`

### 5. Hidden Contracts

Check for implicit assumptions:
- Does `orient()` expect git repo?
- Can predicates be shared across repos?
- Are validators deterministic?

## Findings

(To be populated by audit phase)

### Dead APIs

List APIs exported but never called in the codebase.

### Naming Conflicts

List ambiguous names (e.g., two different "merge" types).

### Incomplete Contracts

List functions that lack error handling, retries, or timeout specs.

## Output

1. Detailed API report (for developers)
2. Public API contract document (for consumers)
3. Modernization list (for phase 10)

## Next

Results feed into phase 10: API refactoring and entry-point normalization.
