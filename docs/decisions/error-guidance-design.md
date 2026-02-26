# Error Guidance Design

## Problem

Roadmap errors are often cryptic:
- ❌ `missing node "build-phase"` — which node references it?
- ❌ `verify() returned 5 gaps` — what should I do?
- ❌ `orient() returned untracked` — how do I initialize?

Users need:
1. **What went wrong** — clear description
2. **Why it happened** — root cause
3. **How to fix it** — concrete steps

## Solution: Structured Error Guidance

### Error Model

```typescript
interface RoadmapError extends Error {
  code: ErrorCode;
  context: ErrorContext;
  fix: string;              // Actionable fix
  entry: string;            // Which API method failed
  examples?: readonly string[];  // Code examples
}

type ErrorCode =
  | 'CYCLE_DETECTED'
  | 'MISSING_NODE'
  | 'MISSING_INIT_OR_TERM'
  | 'ARTIFACT_NOT_SATISFIED'
  | 'ARTIFACT_NOT_PRODUCED'
  | 'NODE_UNREACHABLE'
  | 'POSITION_NOT_FOUND'
  | 'INVALID_PREDICATE'
  | ...;
```

### By Error Code

#### CYCLE_DETECTED
**Symptom:** `Error: cycle detected in DAG: a→b→c→a`

**Why:** Dependencies form a loop — work can't be ordered.

**Fix:**
1. Identify the cycle: `a→b→c→a`
2. Remove one dependency edge
3. Example: if `c` depends on `a` only for artifacts, move the edge later in the DAG

**Example:**
```typescript
// ❌ WRONG: cycle
const g = {
  nodes: {
    a: { deps: ['c'], ... },
    c: { deps: ['a'], ... }
  }
};

// ✅ FIXED: linear
const g = {
  nodes: {
    a: { deps: [], ... },
    b: { deps: ['a'], ... },
    c: { deps: ['b'], ... }
  }
};
```

#### ARTIFACT_NOT_SATISFIED
**Symptom:** `Error: node "test" consumes "src/index.ts" but no predecessor produces it`

**Why:** A node declares artifact consumption but no previous node produces it.

**Fix:**
1. Check the graph: which node should produce `src/index.ts`?
2. Add producer to its `produces` array
3. Or remove consumer from `consumes`

#### POSITION_NOT_FOUND
**Symptom:** `Error: orient() returned "untracked" — no DAG found`

**Why:** No `.roadmap/head.json` exists in project.

**Fix:**
1. Is this a multi-repo project? Check `dependencies` in `.roadmap.json`
2. Do you have an initialized roadmap? Run: `roadmap init`
3. If manually building DAG: create `.roadmap/head.json` with init/term

### Guidance Principles

1. **Assume the error is our fault** — don't blame the user
2. **Provide concrete fix** — "Change X to Y"
3. **Show examples** — code, not philosophy
4. **Suggest tools** — CLI commands to help
5. **Link context** — which file, which node?

### Error Display (CLI)

```bash
$ roadmap validate --note "test"
Error: node "test" consumes "src/index.ts" but no predecessor produces it

  Entry: validate() → verify()
  Code: ARTIFACT_NOT_SATISFIED
  Node: test
  Missing: src/index.ts

  Fix:
    1. Check which node should produce src/index.ts (usually 'build' or 'init')
    2. Add "src/index.ts" to that node's "produces" array
    3. Run: roadmap validate --note "test"

  Example:
    nodes: {
      build: {
        produces: ["src/index.ts", "dist/"],
      },
      test: {
        consumes: ["src/index.ts"],
        deps: ["build"]
      }
    }

  Docs: https://github.com/anthropics/roadmap/docs/errors#ARTIFACT_NOT_SATISFIED
```

### Implementation

Each error code maps to:
- Human description
- Root cause explanation
- Fix steps
- Code example
- Test case

Stored in `src/errors.ts`:

```typescript
const ErrorGuidance: Record<ErrorCode, Guidance> = {
  CYCLE_DETECTED: {
    title: '...',
    why: '...',
    fix: ['Step 1', 'Step 2'],
    example: '...',
    relatedCodes: ['MISSING_NODE']
  }
};
```

### Testing

For each error:
1. Create scenario that triggers it
2. Assert error code
3. Assert fix message contains actionable steps
4. Example: `test('CYCLE_DETECTED error guides user to remove edge')`

## Benefits

- ✅ Users unblock themselves (80% of cases)
- ✅ Debugging is self-documenting
- ✅ Less support burden
- ✅ Better learning curve

## Next

Phase 9: Implement error guidance and test all codes

## Related

- `src/errors.ts` — error definitions
- `src/protocol.ts` — where errors are thrown
- `tests/error-guidance.test.ts` — test suite
