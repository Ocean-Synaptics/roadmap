# Roadmap Adoption Guide

## Quick Start

### 1. Install
```bash
npm install roadmap
```

### 2. Initialize
```bash
roadmap integrate --auto
```

This generates:
- `.roadmap.json` — project metadata
- `.roadmap/head.json` — initial DAG

### 3. Start Executing
```bash
roadmap orient --note "starting work"
roadmap chart
```

## Use Cases

### Individual Project
Single repo with build → test → release phases.

```bash
npm install roadmap
roadmap integrate --auto
# View progress
roadmap chart
```

### Multi-Repo Monorepo
Multiple independent projects with shared dependencies.

**File:** `.roadmap.json` in each repo declares dependencies.

```bash
# In project-b/
roadmap integrate --auto
# Automatically discovers ../project-a as dependency
roadmap chart --deps  # shows cross-repo progress
```

### Autonomous Agents (with Regent)
DAG-native execution by sealed agents.

```bash
regent-on  # activate enforcement
# Agents spawn, read roadmap, execute phases autonomously
roadmap trail --global  # view execution history
```

## Core Concepts

### 1. Position (Orientation)
Where are you in the DAG? What's already built?

```bash
roadmap orient --note "check status"
```

Returns: current node ID, artifacts that exist, remaining work.

### 2. Artifacts
Concrete outputs: files, directories, metadata files.

```json
{
  "init": ["package.json", "src/**/*.ts"],
  "term": ["dist/", "coverage/"]
}
```

### 3. Dependencies
What your project needs from others.

```json
{
  "dependencies": [
    {
      "repo": "../fusion",
      "consumes": ["dist/"],
      "mustComplete": true
    }
  ]
}
```

### 4. Validation
Did the build do what it claimed?

Handled automatically via artifact existence checks.

## Key APIs

### Developers
```typescript
import { define, verify, orient, check } from 'roadmap';

const g = define(myDAG);
verify(g);            // Check contracts
const pos = orient(g, fileExists(cwd()));  // Find position
check(g);             // Validate structure
```

### Agents
```typescript
import { getBrief, advance, checkpoint } from 'roadmap/agent';

const brief = await getBrief();
await advance('in-progress');
await checkpoint('milestone-1', artifacts);
```

### CLI
```bash
roadmap orient --note "why"
roadmap chart
roadmap validate --note "check rules"
roadmap trail --last 10
```

## Common Patterns

### Pattern: Linear Build
A → B → C (strict order)

**Solution:** `auto-bootstrap-command` detects and creates linear DAG.

```bash
roadmap integrate --auto
```

### Pattern: Parallel Build
A, B, C (independent) → Release

**Solution:** `.roadmap/head.json` defines parallelOrder.

```typescript
const order = parallelOrder(g);
// [ ['a', 'b', 'c'], ['release'] ]
```

### Pattern: Monorepo with Shared Deps
Multiple repos depend on core library.

**Solution:** Core repo's `.roadmap.json` lists dependent repos.

```json
{
  "dependencies": [
    { "repo": "../project-a", ... },
    { "repo": "../project-b", ... }
  ]
}
```

## Troubleshooting

### "orient returns untracked"
**Cause:** No DAG found at `.roadmap/head.json`

**Fix:**
```bash
roadmap integrate --auto
```

### "Phase blocked forever"
**Cause:** Dependency not complete or artifact missing

**Fix:**
```bash
# Check sibling repo
cd ../dependency
roadmap chart

# Or force recovery
roadmap checkpoint --restore last
```

### "Artifact not found after build"
**Cause:** Build output path mismatch

**Fix:**
1. Run build manually: `npm run build`
2. Check what was produced
3. Update `term` in `.roadmap.json`
4. Run: `roadmap orient --note "fixed paths"`

## Best Practices

### 1. Keep DAG Simple
5-20 nodes per roadmap. Larger projects use sub-phases.

### 2. Declare Dependencies Honestly
Only what you truly consume.

### 3. Use Checkpoints
Every major phase:
```bash
roadmap checkpoint --label "after-build"
```

### 4. Monitor Cross-Repo
```bash
roadmap chart --deps  # visualize all connected repos
```

### 5. Test Recovery
```bash
roadmap checkpoint --label "test"
rm -rf dist/
roadmap restore --label "test"
```

## Next Steps

- **Phase learning:** Read `docs/decisions/` for design rationale
- **Multi-repo setup:** See `docs/multi-project-patterns.md`
- **Agent integration:** Check `.claude/agents/` for sealed API
- **Error handling:** Review `docs/decisions/error-guidance-design.md`

## Support

- **Docs:** `https://roadmap.dev`
- **Issues:** GitHub issues (with DAG example)
- **Examples:** `example/` directory in this repo
