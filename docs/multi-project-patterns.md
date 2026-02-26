# Multi-Project Patterns

## Overview

Roadmap enables multi-repo coordination through explicit dependency declarations in `.roadmap.json`. This document covers patterns, pitfalls, and best practices.

## Pattern 1: Linear Build Chain

**Use case:** Project A → B → C (strict sequence)

```
A: compile → A:test → publish A artifacts
          ↓
          B: uses-A-artifacts → B:compile → B:test
                       ↓
                       C: uses-B-artifacts → C:compile
```

**.roadmap.json (B):**
```json
{
  "dependencies": [
    {
      "repo": "../a",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": true
    }
  ]
}
```

**DAG (B):**
```
bootstrap
  ↓
a-ready (artifact: ../a/dist/)
  ↓
compile (uses A's dist/)
  ↓
test
  ↓
release
```

**Execution:**
1. Regent orients A's roadmap
2. A is not complete → block B
3. A completes → mark a-ready in B
4. B compile can now proceed

## Pattern 2: Parallel with Merge

**Use case:** Multiple independent builds → merged release

```
A: build → artifacts
B: build → artifacts
C: build → artifacts
          ↓ (all must complete)
          Release (uses all three)
```

**.roadmap.json (Release):**
```json
{
  "dependencies": [
    { "repo": "../a", "consumes": ["dist/"], "phase": "build", "mustComplete": true },
    { "repo": "../b", "consumes": ["dist/"], "phase": "build", "mustComplete": true },
    { "repo": "../c", "consumes": ["dist/"], "phase": "build", "mustComplete": true }
  ]
}
```

**DAG (Release):**
```
bootstrap
  ↓
(parallel)
├→ a-ready (checks ../a/dist/)
├→ b-ready (checks ../b/dist/)
└→ c-ready (checks ../c/dist/)
  ↓
release (uses all three)
```

**Execution:**
- All three dependencies checked in parallel
- Release blocked until all are complete

## Pattern 3: Optional Dependencies

**Use case:** B can run without A, but uses A's output if available

**.roadmap.json (B):**
```json
{
  "dependencies": [
    {
      "repo": "../a",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": false  // ← optional
    }
  ]
}
```

**DAG (B):**
```
bootstrap
  ↓
a-optional (artifact: ../a/dist/ OR skip)
  ↓
compile (handles both cases)
```

**Behavior:**
- If ../a/dist/ exists: use it
- If ../a/dist/ missing: compile continues anyway
- Allows partial builds without full stack

## Pattern 4: Transitive Dependencies

**Use case:** A → B → C (Regent discovers automatically)

```
A: dist/
├→ B consumes A
│  ├→ C consumes B
```

**.roadmap.json (B):**
```json
{
  "dependencies": [
    {
      "repo": "../a",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": true
    }
  ]
}
```

**.roadmap.json (C):**
```json
{
  "dependencies": [
    {
      "repo": "../b",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": true
    }
  ]
}
```

**Regent's cross-orient:**
1. Load C's dependencies → find B
2. Load B's dependencies → find A
3. Build transitive graph: A → B → C
4. Execution: A first, B second, C third

## Pattern 5: Environment Overrides

**Use case:** CI/container with non-standard paths

**.roadmap.json:**
```json
{
  "dependencies": [
    {
      "repo": "fusion",
      "consumes": ["dist/"],
      "phase": "build",
      "siblingPath": "/workspace/fusion"  // ← explicit path
    }
  ]
}
```

**Or environment variable:**
```bash
export ROADMAP_SIBLING_ROOT=/monorepo
roadmap orient --note "cross-repo"
```

## Best Practices

### 1. Keep Dependencies Coarse

```json
// ✅ GOOD: phase-level
{
  "repo": "../a",
  "phase": "build",
  "consumes": ["dist/"]
}

// ❌ WRONG: artifact-level
{
  "repo": "../a",
  "consumes": ["dist/lib/core.js", "dist/lib/utils.js"]  // too granular
}
```

### 2. Always Mark mustComplete

```json
// ✅ GOOD: explicit
{
  "repo": "../a",
  "mustComplete": true   // blocks B if A fails
}

// ❌ IMPLICIT: unclear behavior
{
  "repo": "../a"
}
```

### 3. Use Relative Paths

```json
// ✅ GOOD: relative
{
  "repo": "../sibling",
  "repo": "../../cousin"
}

// ❌ BAD: absolute (breaks in containers)
{
  "repo": "/home/user/projects/sibling"
}
```

### 4. Declare consumptions honestly

```json
// ✅ GOOD: only what you need
{
  "consumes": ["dist/"]
}

// ❌ WRONG: overbroad
{
  "consumes": ["dist/", "src/", "tests/", "docs/"]
}
```

### 5. Plan for Offline

```json
// ✅ GOOD: can work without network
{
  "siblingPath": "../local/copy"
}

// ❌ BAD: requires git clone
{
  "repo": "https://github.com/user/project.git"
}
```

## Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| "roadmap chart --deps not showing A" | A's .roadmap/head.json missing | Initialize A: `roadmap init` |
| "B blocked forever on A" | A's artifact path wrong | Verify A produces what B consumes |
| "Container: A's path not found" | Hardcoded absolute path | Use ROADMAP_SIBLING_ROOT |
| "Transitive deps loop: A→B→C→A" | Cycle in dependencies | Remove one edge, reorder |

## Performance Considerations

- **Orient time:** O(n) where n = # of repos. Parallel cross-orient mitigates.
- **Dependency graph:** Acyclic by construction (DAG validation)
- **Large monorepos:** Group repos by phase to reduce dependencies

## Future Extensions

- Conditional dependencies (if A's build fails, skip B)
- Version-pinning (require A ≥ 1.0.0)
- Artifact caching across repos
- Dependency visualization (graphviz)
