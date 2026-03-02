# Governance Hardening Design

## Overview

Automate three governance gaps: auto-propagate on DAG mutation, local pre-commit validation, main branch protection. Result: fail-fast locally, enforce governance at merge.

## Architecture

### 1. Auto-Propagate on Every DAG Mutation

**Problem:** Expand/merge create candidate DAGs, but `propagate` must be run manually to back-derive validation rules. If skipped, DAG has incomplete validation (missing `artifact-exists` rules that should be propagated).

**Solution:** Make propagate automatic and transparent.

#### Expand Command Flow (Current)
```
1. User: roadmap expand scripts/expand-*.ts --note "..."
2. Expansion script runs, outputs child nodes
3. Candidate DAG created with plan node replaced
4. User reviews candidate (optional step)
5. User: roadmap dag accept
6. User must manually: roadmap propagate
7. head.json updated
```

#### Expand Command Flow (Hardened)
```
1. User: roadmap expand scripts/expand-*.ts --note "..."
2. Expansion script runs, outputs child nodes
3. Candidate DAG created with plan node replaced
4. Auto: roadmap propagate runs on candidate
   → back-derives artifact-exists rules
   → ensures all validation rules are complete
5. User reviews fully-validated candidate
6. User: roadmap dag accept
7. head.json updated (propagation already applied)
```

**Implementation:**
- Modify `bin/roadmap.ts` expand command handler
- After candidate is created, invoke `propagate()` library function
- Pass `--dry-run` first, show user the propagated result
- If user accepts, apply propagation
- If user rejects, allow manual propagate or changes

**Trigger Point:** `src/lib/roadmap/dag-consolidator.ts` expand handler
```typescript
async function expandNode(script: string, nodeId: string) {
  const candidate = await loadCandidateDAG(script);
  const propagated = await propagate(candidate); // NEW
  return presentForReview(propagated);
}
```

#### Merge/Consolidate Flow (Hardened)
```
1. System detects multiple .roadmap/*.json files
2. Discovers dependency relationships
3. Merges all DAGs into unified graph
4. Auto: roadmap propagate runs on merged DAG
   → validates cross-DAG dependencies
   → back-derives rules across boundaries
5. head.json contains unified, validated DAG
```

**Implementation:**
- Modify `roadmap consolidate` or auto-merge system
- After merge completes, run propagate immediately
- Ensure cross-DAG artifact dependencies are validated
- Update index with propagated rules

### 2. Pre-Commit Hook: Local Validation Gates

**Problem:** Broken code (TypeScript errors, DAG structural issues) gets pushed to CI, wasting time and cloud resources. Developers should catch these locally.

**Solution:** Git pre-commit hook runs quick validation gates.

#### Hook Implementation

File: `scripts/hooks/pre-commit`

```bash
#!/bin/bash
set -e

echo "🔍 Pre-commit validation..."

# 1. TypeScript check
echo "  ➤ TypeScript..."
if ! npm run check > /tmp/tsc.log 2>&1; then
  cat /tmp/tsc.log
  exit 1
fi

# 2. DAG structural integrity
echo "  ➤ DAG structure..."
if ! npm run check:dag:define > /tmp/dag.log 2>&1; then
  cat /tmp/dag.log
  exit 1
fi

echo "✅ All pre-commit gates passed"
exit 0
```

**Installation:**
```bash
git config core.hooksPath scripts/hooks
# Or manual: cp scripts/hooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

**Scope:**
- `npm run check` — TypeScript compilation (catches type errors immediately)
- `npm run check:dag:define` — DAG structural validation (catches missing nodes, cycles, etc.)

**Not included** (too slow for pre-commit):
- Full test suite (would slow down commits)
- Integration tests
- Promotion ledger generation

**Trade-off:** 80% of issues caught locally, 20% caught in CI. Acceptable because CI runs in parallel on dedicated machines.

#### Bypass (Explicit)
```bash
# Emergency only, requires intention
git commit --no-verify
```

Document this is governance-restricted and requires justification in commit message.

### 3. Main Branch Protection Rules

**Problem:** Main branch accepts any push. No enforcement that CI gates passed, promotion evidence exists, or code was reviewed.

**Solution:** GitHub branch protection rules on main.

#### Rules

**File:** `governance/branch-protection.json` (for documentation; actual enforcement via GitHub UI/API)

```json
{
  "branch": "main",
  "protection": {
    "requirePullRequestReviews": {
      "requiredApprovingReviewCount": 1,
      "dismissStaleReviews": false,
      "requireCodeOwnerReviews": false
    },
    "requiredStatusChecks": {
      "strict": true,
      "contexts": [
        "CI/setup",
        "CI/typecheck",
        "CI/dag-verify",
        "CI/test-ledger-gate",
        "CI/plan-gate",
        "CI/spec-origin-gate",
        "CI/plan-selection-check",
        "CI/gitsha-completion-gate",
        "CI/surface-guard",
        "CI/promotion-ledger"
      ]
    },
    "requireBranchesToBeUpToDate": true,
    "allowForcePushes": false,
    "allowDeletions": false
  }
}
```

**Enforcement:**
1. **Require 1 approval** — Human review gate. Catches logic errors, design issues.
2. **Require CI passing** — All GitHub Actions checks must pass (defined in ci.yml).
3. **Require promotion ledger** — Generated in CI. Proves governance compliance.
4. **Block force push** — Prevent history rewriting on main.
5. **Block deletion** — Prevent accidental branch removal.

**Setup Process:**
1. Create `governance/branch-protection.json` documenting the rules
2. Manually apply via GitHub > Settings > Branches > main > Add Rule
3. OR use GitHub API via script `scripts/setup-branch-protection.ts`

### 4. Rollout Strategy

**Phase 1: Pre-Commit Hook (This DAG)**
- Implement locally in `scripts/hooks/pre-commit`
- Git config points to it
- No CI changes needed
- Immediate developer benefit

**Phase 2: Auto-Propagate (This DAG)**
- Integrate into expand command
- Integrate into consolidate/merge
- Tests for auto-propagate behavior
- Update CLI docs

**Phase 3: Branch Protection (This DAG)**
- Create governance/branch-protection.json
- Apply rules via GitHub
- Document in GOVERNANCE.md

**Activation:**
- Phase 1 is local (immediate, no coordination needed)
- Phase 2 is library-level (update tests, no CI change)
- Phase 3 is repository-level (requires GitHub permissions, human-applied once)

## Decision Points

### Question: Should pre-commit hook be required or optional?

**Current Design:** Required (always runs unless `--no-verify`)

**Rationale:**
- Catching errors locally is 95% cheaper than CI
- Fail-fast principle: developers see errors immediately
- Low friction: hook is fast (~5s for both checks combined)

**Override:** `git commit --no-verify` for emergencies, but discourages casual use.

### Question: What happens if auto-propagate changes the DAG unexpectedly?

**Current Design:** Show diff before accepting

```
roadmap expand script.ts
# Output: "Will propagate 3 artifact-exists rules..."
# User reviews, then: roadmap dag accept
```

**Rationale:**
- Propagation is deterministic (same inputs → same outputs)
- Showing the diff educates users about back-derivation
- User can reject if rules are wrong (indicates spec issue)

### Question: Should main branch protection be strict (require all checks) or lenient (allow force push)?

**Current Design:** Strict (no force push, all checks required)

**Rationale:**
- Main is canonical; history should be immutable
- If a bad commit lands, it's tracked in git history (important for audit)
- Force push hides problems; better to revert and re-apply

## Success Criteria

- ✅ Pre-commit hook catches TypeScript errors locally (0 broken pushes)
- ✅ Pre-commit hook catches DAG integrity errors locally
- ✅ Auto-propagate on expand produces fully-validated DAG
- ✅ Auto-propagate on merge validates cross-DAG dependencies
- ✅ Main branch protected: no merge without CI passing + 1 approval
- ✅ No governance gaps: propagate is automatic, not manual
- ✅ Developers see immediate feedback (5s pre-commit, not 60s CI)

## Next Steps

1. **Implement precommit-hook-impl** — create scripts/hooks/pre-commit
2. **Implement auto-propagate-expand** — modify bin/roadmap.ts expand handler
3. **Implement auto-propagate-merge** — modify DAG consolidator
4. **git-hook-config** — set git core.hooksPath
5. **Tests** — verify auto-propagate behavior, hook behavior
6. **CI integration** — ensure CI gates still work with auto-propagate
7. **Documentation** — GOVERNANCE.md with usage examples
8. **Branch protection** — apply GitHub rules (manual step)
