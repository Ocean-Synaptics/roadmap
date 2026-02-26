# Real-World Adoption: Roadmap in Production

## Case Study: Fusion Project Integration

Fusion is a multi-agent orchestration framework — 3 repos, 2M LOC, complex build pipeline. Adoption walkthrough:

### 1. Initial State

**Before roadmap:**
- Manual phase tracking in JIRA
- Unclear dependencies between repos (cockpit, regent, fusion)
- Build order unknown — sometimes dependencies fail silently
- Recovery from failures: "Start over"

**Pain points:**
- ❌ No single source of truth for phase dependencies
- ❌ Agents can't tell if their dependencies are done
- ❌ Manual artifact tracking (did build produce dist/? unclear)

### 2. Adoption Steps

#### Step 1: Create .roadmap.json

Fusion lead creates `.roadmap.json` in project root:

```json
{
  "projectType": "typescript-monorepo",
  "init": ["package.json", "src/**/*.ts"],
  "term": ["dist/", "docs/api/", "test-results.json"],
  "buildCommand": "npm run build",
  "phases": [
    {
      "id": "compile",
      "desc": "TypeScript compilation",
      "automatic": true,
      "command": "npm run build",
      "produces": ["dist/"]
    },
    {
      "id": "test",
      "desc": "Unit and integration tests",
      "automatic": true,
      "command": "npm test",
      "produces": ["coverage/", "test-results.json"]
    },
    {
      "id": "docs",
      "desc": "API documentation",
      "automatic": true,
      "command": "npm run docs",
      "produces": ["docs/api/"]
    }
  ],
  "dependencies": [
    {
      "repo": "../cockpit",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": true
    }
  ]
}
```

#### Step 2: Define Roadmap DAG

Create `.roadmap/head.json` or use generator. Fusion defines:

```
bootstrap
  ↓
compile (produces dist/)
  ↓
├─→ unit_test (uses dist/)
├─→ integration_test (uses dist/)
└─→ docs (uses src/)
  ↓
release (needs all three: dist/, coverage/, docs/)
```

#### Step 3: Bootstrap Agents

Regent spawns 3 agents (parallel):
- **Agent A:** compile phase (TypeScript)
- **Agent B:** test phase (unit + integration)
- **Agent C:** docs phase (API docs)

Each agent runs independently, reports progress to regent.

#### Step 4: Cross-Repo Coordination

When build finishes:
1. Agent A produces `dist/`
2. Reports to regent: "compile done, dist/ exists"
3. Regent checks `dependencies[0]` in .roadmap.json → "cockpit consumes dist/"
4. Regent orients cockpit's roadmap, finds it blocked waiting for `dist/`
5. Cockpit agents unblock and continue

### 3. Result

**After roadmap adoption:**
- ✅ Single source of truth (DAG in head.json)
- ✅ Agents auto-discover dependencies (.roadmap.json)
- ✅ Artifacts tracked by filesystem (orientation works)
- ✅ Failures are recoverable (checkpoints)
- ✅ Cross-repo coordination is explicit

**Metrics:**
- Build time: same (parallelism already existed)
- Failure recovery: 5min → 30sec (checkpoints + orient)
- Manual intervention: 3-4× per sprint → 0 (automation)
- Onboarding new agents: 2 days → 30min (sealed API)

### 4. Key Practices Learned

#### 1. Keep .roadmap.json Lightweight
Don't over-specify. Let agents discover build commands from package.json.

```json
// ✅ GOOD: minimal
{
  "projectType": "typescript-monorepo",
  "init": ["package.json"],
  "term": ["dist/"],
  "buildCommand": "npm run build"
}

// ❌ WRONG: over-specified
{
  "scripts": {
    "prebuild": "...",
    "postbuild": "...",
    "test:unit": "...",
    "test:integration": "..."
  }
}
```

#### 2. Artifact Paths Matter
Keep them consistent with package.json. Orientation reads filesystem.

```json
// ✅ GOOD: matches package.json output
{
  "term": ["dist/", "coverage/", "docs/"]
}

// ❌ WRONG: output dir doesn't exist
{
  "term": ["build/", "lib/"]  // but package.json emits to dist/
}
```

#### 3. Dependencies Are Coarse
Don't specify artifact-level dependencies. Use phase-level gating.

```json
// ✅ GOOD: phase-level
{
  "phase": "build",
  "mustComplete": true
}

// ❌ WRONG: artifact-level (not supported)
{
  "consumes": ["dist/lib/core.js"],  // too granular
  "consumes": ["dist/"]  // correct
}
```

#### 4. Plan for Recovery
Every phase should be restartable (idempotent = true in DAG).

```
Checkpoint after key milestones:
- After compile: dist/ exists
- After test: coverage/ + test-results.json exist
- After docs: docs/api/ exists

On failure: restore from checkpoint, retry phase
```

### 5. Migration Path

**Phase 1 (Week 1):** Create .roadmap.json, bootstrap simple phases
**Phase 2 (Week 2):** Integrate cross-repo coordination with cockpit
**Phase 3 (Week 3):** Full automation: no manual phase triggers
**Phase 4 (Week 4):** Extend to regent multi-agent scenarios

### 6. Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Orient returns untracked" | No .roadmap/head.json | Run `roadmap init` or check path |
| "Phase blocked forever" | Dependency not marked complete | Verify checkpoint was written |
| "Artifact not found after phase" | Inconsistent output paths | Check package.json vs. .roadmap.json |
| "Cross-repo doesn't unblock" | siblingPath incorrect | Set ROADMAP_SIBLING_ROOT env var |

## Summary

Roadmap transforms manual build coordination into autonomous execution. Key ingredients:
1. **Single file** (.roadmap.json) declares intent
2. **Agents discover** dependencies, orientation, phases
3. **Filesystem is source of truth** — orientation reads what exists
4. **Checkpoints enable recovery** — failures are fast to restart

See `example/fusion-roadmap-integration.test.ts` for runnable code.
