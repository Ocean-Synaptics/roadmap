# Worktree Protocol: Unified DAG Editing Discipline

**Version:** 1.0
**Status:** Specification
**Scope:** All users (human and LLM agents) editing roadmap DAGs
**Governed by:** roadmap-worktree-protocol-001 DAG

---

## Overview

The worktree protocol establishes a single unified discipline for editing DAGs across branches, preventing concurrent modifications to `head.json` on `main` and automating consolidation when branches merge back. This protocol:

- **Isolates DAG edits** to feature branches via git worktrees
- **Enforces branch discipline** through pre-commit hooks
- **Automates consolidation** when multiple DAGs merge to main
- **Works identically** for humans and LLM agents
- **Prevents conflicts** by design, not by retroactive resolution

---

## Problem Statement

### Without Protocol
- Multiple users/agents edit `head.json` on different branches → merge conflicts
- Manual conflict resolution during branch merges → error-prone
- Concurrent edits to head.json on main → race conditions, corruption
- No clear workflow for spawning isolated work on specific nodes
- Consolidation of multi-DAG system is manual + fragile

### With Protocol
- All DAG edits happen on `feat/*` branches in isolated worktrees
- `head.json` on main is read-only (pre-commit hook enforces)
- Multi-DAG consolidation is automatic at merge time
- Single workflow covers users and agents
- Position tracking survives branch switches via orient snapshot

---

## Core Concepts

### 1. Worktree
A git worktree is an isolated working directory linked to the same repository. Each worktree has its own `.git/worktrees/<name>` directory.

**Why**: Allows parallel work on different branches without switching directories. Each worktree is self-contained; checking out a different branch in one doesn't affect the others.

### 2. Feature Branch (`feat/*`)
A branch following the naming pattern `feat/<node-id>` or `feat/<scope>/<id>`. Work on a specific node is isolated to its branch.

**Enforcement**: Pre-commit hook rejects `head.json` edits on any branch except:
- `feat/*` (feature branches allowed)
- `wip/*` (work-in-progress branches allowed)
- `develop`, `main` → NO edits to head.json (auto-rejected)

### 3. Head.json Consolidation
When multiple feature branches (each with independent DAG modifications) merge back to main, their individual DAGs are automatically merged into a single unified DAG via `mergeMultiWay()`.

**Rule**: The newest commit on main always contains a single unified `head.json` that is the superset of all merged branches.

### 4. Merge Orchestration
The `roadmap merge-batch --from <branch1>,<branch2>,... ` command:
1. Validates each branch's DAG is well-formed
2. Merges all DAGs into unified graph
3. Validates unified graph (acyclic, init↔term connected, consumes satisfied)
4. Commits unified `head.json` to main
5. Fast-forwards or squash-merges each branch into main

**Contract**: Every branch that contributes to main must have a valid DAG; merge rejects invalid inputs.

### 5. Session Lifecycle
```
spawn worktree → work on node → commit → merge → cleanup
```

All steps are protocol-enforced.

---

## User Workflow: How Humans Work

### Setup (First Time)
```bash
cd /repo
roadmap orient --note "session start — examining protocol-design node"
roadmap chart
```

Position shows current batch. Let's say you need to edit node `precommit-hook-enforcement`.

### Spawn Worktree
```bash
roadmap spawn --task precommit-hook-enforcement
```

**What happens:**
1. Creates new git worktree: `.claude/worktrees/precommit-hook-enforcement`
2. Creates new feature branch: `feat/precommit-hook-enforcement`
3. Checks out branch in worktree
4. Prints worktree path and instructions

**Output:**
```
✅ Worktree spawned: .claude/worktrees/precommit-hook-enforcement
   Branch: feat/precommit-hook-enforcement
   Location: /home/user/repo/.claude/worktrees/precommit-hook-enforcement

   Next:
   cd /home/user/repo/.claude/worktrees/precommit-hook-enforcement
   [edit scripts/hooks/pre-commit]
   git add scripts/hooks/pre-commit
   git commit -m "precommit-hook-enforcement: reject head.json edits on main"
   roadmap complete precommit-hook-enforcement
```

### Work in Worktree
```bash
cd .claude/worktrees/precommit-hook-enforcement
# Edit files (specified by node's produces)
vim scripts/hooks/pre-commit
git add scripts/hooks/pre-commit
git commit -m "precommit-hook-enforcement: reject head.json edits on main"
```

**Constraints:**
- Only commit files listed in the node's `produces` array
- Commit message format: `<node-id>: <what>`
- Do not edit `head.json` directly on feature branches (protocol allows it but next step rejects it)

### Validate & Complete
```bash
roadmap complete precommit-hook-enforcement
```

**What happens:**
1. Runs validation rules from node spec
2. If all pass: node is marked complete in trail
3. If any fail: reports error + fix suggestions, does not advance
4. On success: prints next steps (merge + cleanup)

### Merge
When batch is complete, merge all branches back to main:
```bash
roadmap merge-batch --from feat/precommit-hook-enforcement,feat/worktree-spawn-command
```

**What happens:**
1. Validates each branch's DAG
2. Merges all DAGs via `mergeMultiWay()` → single unified head.json
3. Validates merged graph
4. Commits to main
5. Fast-forwards each branch to main (or squash-merges)

**Output:**
```
✅ Merged 2 branches into main
   - feat/precommit-hook-enforcement
   - feat/worktree-spawn-command

   Unified head.json created: 127 nodes, 8 phases
   All validation passed
```

### Cleanup
```bash
roadmap cleanup-worktrees
```

**What happens:**
1. Finds all worktrees in `.claude/worktrees/`
2. Verifies branch is merged to main
3. Deletes worktree directory
4. Removes branch from repo

---

## Agent Workflow: How LLM Agents Work

### Initialization
When spawned by orchestrator:
```bash
roadmap orient --note "precommit-hook-enforcement — enforcing head.json edits on feat/* only"
roadmap spawn --task precommit-hook-enforcement --agent
```

**Differences from human workflow:**
- `--agent` flag tells spawn to:
  - NOT print to stdout (silent mode)
  - Create deterministic worktree name
  - Prepare sealed brief
- Spawn writes brief to `.roadmap/brief-<node-id>.json`

### Read Brief
Agent reads sealed brief (NOT full DAG):
```json
{
  "nodeId": "precommit-hook-enforcement",
  "produces": ["scripts/hooks/pre-commit"],
  "consumes": [],
  "description": "Update pre-commit hook to enforce worktree protocol...",
  "pattern": "shell-script: reject head.json edits on main",
  "handoffs": null
}
```

**Contract**: Brief contains ONLY:
- nodeId, produces, consumes, description, pattern, handoffs
- NO DAG introspection, NO visibility into other nodes or full structure
- NO access to trail or completion history

### Work
Agent executes:
1. Reads `consumes` (dependencies) if any
2. Implements `produces` (writes files)
3. Commits with message `<node-id>: <what>`
4. Calls `roadmap complete <node-id>`

### Handoff
On completion, agent writes handoff:
```json
{
  "nodeId": "precommit-hook-enforcement",
  "status": "complete",
  "timestamp": "2026-03-02T14:30:00Z",
  "artifacts": ["scripts/hooks/pre-commit"],
  "decisions": [
    "Reject head.json modifications on main/master by checking branch name",
    "Allow edits on feat/* and wip/* branches",
    "Exit with code 1 on violation to fail commit"
  ],
  "gotchas": [
    "Pre-commit hook must be executable (chmod +x)",
    "Must handle both 'main' and 'master' branch names for compatibility"
  ],
  "nextAgent": "precommit-hook-enforcement → merge-orchestrator-command"
}
```

### Merge & Cleanup (Orchestrator Responsibility)
Orchestrator calls:
```bash
roadmap merge-batch --from <list of merged branches>
roadmap cleanup-worktrees
```

Agent does NOT handle merge/cleanup; orchestrator coordinates.

---

## Merge Semantics: How Consolidation Works

### Input: Multiple Feature Branches
Each branch has its own isolated DAG modifications:

**Branch `feat/precommit-hook-enforcement`:**
```json
{
  "id": "roadmap-precommit-001",
  "nodes": {
    "precommit-hook-enforcement": { ... }
  }
}
```

**Branch `feat/worktree-spawn-command`:**
```json
{
  "id": "roadmap-spawn-001",
  "nodes": {
    "worktree-spawn-command": { ... }
  }
}
```

### Consolidation Process

1. **Discover DAGs**: Find all `.roadmap/*.json` files on each branch
   - Exclude: head.json, head-index.json, system files
   - Include: any DAG defining nodes via `{ id, desc, init, term, nodes }`

2. **Load DAGs**: Parse all discovered files

3. **Build Dependency Graph**: For each DAG pair, check:
   - Do produces of DAG-A overlap with consumes of DAG-B?
   - If yes: DAG-B depends on DAG-A
   - Build acyclic directed graph of DAG dependencies

4. **Merge in Topological Order**:
   ```typescript
   mergeMultiWay([dagA, dagB, dagC]) {
     // Sort DAGs topologically
     // For each DAG in order:
     //   merge(accumulated, nextDAG, connectionSpecs)
     // where connectionSpecs = overlapping artifacts
   }
   ```

5. **Validate Merged Graph**:
   - `define(merged)` → no cycles, init↔term reachable
   - `verify(merged)` → all consumes have producers
   - If either fails: reject merge, print errors

6. **Write Unified head.json**:
   ```json
   {
     "id": "roadmap-consolidated-20260302",
     "nodes": {
       "precommit-hook-enforcement": { ... },
       "worktree-spawn-command": { ... },
       ...
     },
     "consolidatedFrom": [
       "roadmap-precommit-001",
       "roadmap-spawn-001"
     ]
   }
   ```

7. **Commit & Push**: Merge branches to main, commit unified head.json

### Conflict Resolution by Design
No merge conflicts because:
- Each branch edits separate DAG files (different `id`, different namespace)
- Consolidation merges at semantic level (DAG merge), not git merge
- Pre-commit hook ensures NO competing edits to head.json
- Result: deterministic, reproducible, conflict-free

### Rollback
If consolidation fails validation:
```bash
roadmap merge-batch --from feat/A,feat/B --dry-run
# Error: Merged graph has cycle in node dependencies
# Fix: Check DAG A and B for circular references
# Then: resolve in source branches and re-attempt merge
```

Branches remain unmerged until issues are resolved.

---

## Implementation Checklist: Downstream Nodes

| Node | Status | What It Delivers |
|------|--------|------------------|
| `precommit-hook-enforcement` | Next | Pre-commit hook: reject head.json on main |
| `worktree-spawn-command` | Ready | CLI: `roadmap spawn --task <id>` |
| `merge-orchestrator-command` | Ready | CLI: `roadmap merge-batch --from ...` |
| `consolidation-at-merge` | Ready | Auto-merge logic: `mergeMultiWay()` + validation |
| `worktree-cleanup` | Ready | CLI: `roadmap cleanup-worktrees` |
| `onboarding-documentation` | Ready | Update CLAUDE.md with workflow |
| `protocol-tests` | Ready | Integration tests: spawn→work→merge→cleanup |
| `protocol-complete` | Ready | System marker: `.protocol/system-ready.json` |

---

## Example Scenarios

### Scenario 1: Single User Editing Single Node

```bash
# Session 1
roadmap orient --note "working on protocol-design"
roadmap spawn --task protocol-design
cd .claude/worktrees/protocol-design
# Edit docs/WORKTREE-PROTOCOL.md
git add docs/WORKTREE-PROTOCOL.md
git commit -m "protocol-design: Worktree protocol spec"
roadmap complete protocol-design

# Merge
roadmap merge-batch --from feat/protocol-design
roadmap cleanup-worktrees
```

**Result**: Feature branch merged to main, unified head.json written, worktree deleted.

### Scenario 2: Two Agents Working in Parallel

```bash
# Orchestrator spawns two agents
roadmap spawn --task precommit-hook-enforcement --agent
roadmap spawn --task worktree-spawn-command --agent

# Agent 1 executes precommit-hook-enforcement
# Agent 2 executes worktree-spawn-command
# (both run in parallel in separate worktrees)

# Agent 1 completes: writes handoff
# Agent 2 completes: writes handoff

# Orchestrator merges both
roadmap merge-batch --from feat/precommit-hook-enforcement,feat/worktree-spawn-command
roadmap cleanup-worktrees
```

**Result**: Two DAGs merged into unified head.json, both agents' work integrated.

### Scenario 3: Sequential Batches

```bash
# Batch 1: precommit-hook-enforcement (L00)
roadmap spawn --task precommit-hook-enforcement --agent
# ... agent executes and completes
roadmap merge-batch --from feat/precommit-hook-enforcement
roadmap cleanup-worktrees

# Batch 2: worktree-spawn-command + merge-orchestrator-command (L01)
roadmap spawn --task worktree-spawn-command --agent
roadmap spawn --task merge-orchestrator-command --agent
# ... both execute in parallel
roadmap merge-batch --from feat/worktree-spawn-command,feat/merge-orchestrator-command
roadmap cleanup-worktrees
```

**Result**: Multiple batches executed, each batch's work merged before next batch spawns.

### Scenario 4: Merge Conflict (How Protocol Avoids It)

**Hypothetical without protocol:**
```
Branch A: edits head.json (adds node precommit-hook-enforcement)
Branch B: edits head.json (adds node worktree-spawn-command)
Merge A + B → JSON merge conflict (both edited same file)
```

**With protocol:**
```
Branch A: edits scripts/hooks/pre-commit (feature branch)
Branch B: edits bin/roadmap.ts (feature branch)
Pre-commit hook: rejects any edits to head.json on feat/* or main ← enforced
Consolidation: discovers independent DAG files, merges semantically
Result: NO merge conflicts, unified head.json is deterministic
```

---

## Pre-Commit Hook Enforcement

### Hook Location
```bash
scripts/hooks/pre-commit
```

### Logic
```bash
#!/bin/bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Allow edits to head.json ONLY on feature/work branches
if [[ "$BRANCH" != "feat/"* ]] && [[ "$BRANCH" != "wip/"* ]] && [[ "$BRANCH" != "develop" ]]; then
  if git diff --cached --name-only | grep -q '\.roadmap/head\.json'; then
    echo "❌ ERROR: Cannot edit head.json on branch '$BRANCH'"
    echo "   Only feat/*, wip/*, and develop branches may edit head.json"
    echo "   Use: roadmap spawn --task <id>"
    exit 1
  fi
fi

# Run linting/tests as needed
exit 0
```

### Enforcement Points
1. **Local commit**: Pre-commit hook rejects
2. **Server push**: Optional post-receive hook rejects (defense in depth)
3. **Merge to main**: `merge-batch` validates DAGs before accepting

### Bypass Restrictions
- `--no-verify` is blocked by governance policy (not forbidden by git)
- Orchestrator should disallow flag in agent execution manifests
- Documented: "Do not use --no-verify" (principle: enforce at design level)

---

## Batching & Parallelism

### Batch Model
Position is always a batch (array of parallel nodes), not a single node:
```bash
roadmap orient  # Returns: position = ['precommit-hook-enforcement']
#               Then: position = ['worktree-spawn-command', 'merge-orchestrator-command']
```

### Parallel Execution
Agents in the same batch spawn concurrently:
```bash
roadmap spawn --task worktree-spawn-command --agent &
roadmap spawn --task merge-orchestrator-command --agent &
wait
```

Each agent:
- Works in isolation (separate worktree, branch, context)
- Writes to different files (no conflicts)
- Completes independently

### Merge Timing
After batch is complete:
```bash
# Collect all branches from batch
BRANCHES=$(roadmap orient --batch-current | jq -r '.branches[]')

# Merge all at once
roadmap merge-batch --from $BRANCHES
```

Result: Single consolidation step per batch, not per-agent.

---

## Session Protocol: Full Lifecycle

### Session Start (Human)
```bash
cd /repo
roadmap orient --note "working on precommit hook enforcement"
roadmap chart
```

**Output shows:**
```
position: protocol-design
level: 0
progress: [░░░░░░░░░░░░░░░░░░░░] 0/8 (0%)

L00  👉 protocol-design  Formalize worktree protocol...
L01  ⏳ precommit-hook-enforcement  Update pre-commit hook...
...
```

### Work Phase
```bash
roadmap spawn --task precommit-hook-enforcement
# [work in worktree]
git add scripts/hooks/pre-commit
git commit -m "precommit-hook-enforcement: reject head.json edits on main"
roadmap complete precommit-hook-enforcement
```

### Checkpoint (Optional)
```bash
roadmap orient --note "precommit hook done, starting spawn command"
roadmap chart  # Show new position
```

### Batch Complete
```bash
roadmap merge-batch --from feat/precommit-hook-enforcement
roadmap cleanup-worktrees
roadmap orient --note "batch 1 merged, batch 2 ready"
roadmap chart
```

### Session End
```bash
roadmap trail --archive
```

**Appends all session breadcrumbs to global trail.**

---

## Session Protocol: Agent Spawn

### Orchestrator Decision
```bash
roadmap orient --assign --note "dispatching batch 1"
```

**Output contains batch allocation:**
```json
{
  "batch": ["precommit-hook-enforcement"],
  "agents": [{ "id": "agent-1", "node": "precommit-hook-enforcement" }]
}
```

### Agent Spawn
```bash
/path/to/agent-executor precommit-hook-enforcement
```

**Agent internally runs:**
```bash
roadmap orient --note "precommit-hook-enforcement — enforcing head.json edits"
roadmap spawn --task precommit-hook-enforcement --agent
# [brief is prepared]
# [agent reads brief]
# [agent executes in worktree]
roadmap complete precommit-hook-enforcement
# [agent writes handoff]
```

### Orchestrator Waits
```bash
# Poll or wait for completion handoff
while [ ! -f .roadmap/handoff-precommit-hook-enforcement.json ]; do
  sleep 1
done

# Read handoff (shows decisions, gotchas, next agent)
cat .roadmap/handoff-precommit-hook-enforcement.json
```

### Batch Merge (Orchestrator)
```bash
# Wait for all agents in batch to complete
# Then merge
roadmap merge-batch --from feat/precommit-hook-enforcement
roadmap cleanup-worktrees

# Advance to next batch
roadmap orient --next --note "batch 1 complete, advancing batch 2"
```

---

## Validation Rules by Node Type

| Node Type | Validators |
|-----------|-----------|
| **Config/Setup** | `artifact-exists`, `shell` (syntax check) |
| **Command/CLI** | `shell` (tsc --noEmit) |
| **Library** | `shell` (tsc), `build-produces` |
| **Tests** | `shell` (vitest run ...) |
| **Terminal/Integration** | `artifact-exists`, `build-produces`, `launch-check` |

All validators must be idempotent (safe to re-run).

---

## Error Handling & Recovery

### Pre-Commit Hook Failure
```bash
git add scripts/hooks/pre-commit
git commit  # ❌ pre-commit hook rejects: "Cannot edit head.json on main"
```

**Fix:**
```bash
# Already on feat/precommit-hook-enforcement branch, so this should NOT happen
# If it does: check branch name
git branch  # Should show: * feat/precommit-hook-enforcement
# If on main: error. Switch back to feature branch.
```

### Validation Failure
```bash
roadmap complete precommit-hook-enforcement
# ❌ Validation failed: grep pattern not found in hook script
```

**Fix:**
```bash
# Read what was expected
roadmap show precommit-hook-enforcement
# validate: [{ type: 'shell', command: "grep -q 'feat/' scripts/hooks/pre-commit ..." }]

# Fix the artifact
vim scripts/hooks/pre-commit  # Add missing pattern
git add scripts/hooks/pre-commit
git commit -m "precommit-hook-enforcement: add feat/ branch check"
roadmap complete precommit-hook-enforcement
```

### Merge Failure
```bash
roadmap merge-batch --from feat/precommit-hook-enforcement,feat/worktree-spawn-command
# ❌ Merge failed: circular dependency between DAGs
```

**Fix:**
1. Check which DAGs are circular
2. Fix in source branches (re-edit node specs to remove cycle)
3. Re-merge: `roadmap merge-batch --from ...`

### Worktree Cleanup Failure
```bash
roadmap cleanup-worktrees
# ⚠️ Branch feat/precommit-hook-enforcement not merged to main
```

**Fix:**
```bash
# Either: manually merge the branch
git checkout main
git merge feat/precommit-hook-enforcement

# Or: delete the branch without merge
git branch -D feat/precommit-hook-enforcement
roadmap cleanup-worktrees  # Now succeeds
```

---

## Constraints & Guarantees

### User-Facing Guarantees
1. **No concurrent edits**: Pre-commit hook prevents edits to head.json on main
2. **No merge conflicts**: Consolidation merges at semantic level, not git level
3. **Deterministic merges**: Same branches merged always produce same unified head.json
4. **Isolated work**: Each worktree is independent; switching branches elsewhere doesn't affect you
5. **Reproducible**: `roadmap chart` always shows same position across all worktrees

### Protocol Guarantees
1. **Validation before merge**: Unified DAG is validated before commit
2. **Atomic commits**: Merge writes single atomic commit with unified head.json
3. **Trail completeness**: Every merge is recorded in `.roadmap/trail.jsonl`
4. **Idempotence**: Completing a node twice is safe (no side effects)
5. **Recovery**: Trail and checkpoint system allows recovery to any prior state

### What Can Fail
1. **Pre-commit hook rejects edit**: User must be on feat/* branch
2. **Validation fails**: Artifacts don't match spec; fix and re-commit
3. **Merge fails**: DAGs have structural problems; fix in branches and retry
4. **Cleanup fails**: Branch not merged; manually merge or force-delete

**No unrecoverable failures by design.**

---

## Comparison: Human vs Agent

| Aspect | Human | Agent |
|--------|-------|-------|
| **Spawn** | `roadmap spawn --task X` | `roadmap spawn --task X --agent` |
| **Stdout** | Full output + instructions | Silent (logs to trail only) |
| **Brief** | Read from CLI hints | Read from `.roadmap/brief-<id>.json` |
| **Work** | Interactive editing | Execute produce + commit |
| **Validation** | Manual test/check | `roadmap complete` runs validation |
| **Handoff** | (Implicit: agent is done) | Writes `.roadmap/handoff-<id>.json` |
| **Merge** | Manual: `roadmap merge-batch` | Orchestrator-initiated |
| **Cleanup** | Manual: `roadmap cleanup-worktrees` | Orchestrator-initiated |

**Outcome:** Identical workflow, different I/O channels.

---

## Future Enhancements

1. **Worktree pooling**: Reuse worktrees across tasks to reduce creation overhead
2. **Conflict detection**: Pre-validate merge before orchestrator commits (dry-run phase)
3. **Partial merges**: Merge subset of branches (not all-or-nothing)
4. **Branch metadata**: Store node provenance in branch refs (GitOps model)
5. **Distributed merges**: Support merging across multiple repos (monorepo support)

---

## References

- **dag-consolidator.ts**: `mergeMultiWay()` implementation, DAG discovery, topological sort
- **Protocol Contracts** (CONTRACTS.md): Implicit assumptions and validation rules
- **Merge Design** (merge-design.md): Two-DAG merge algorithm, connection specs
- **Branch Design** (branch-design.md): Feature branch workflow patterns
- **Roadmap Protocol** (protocol/README.md): Core DAG operations, types, validation stack

---

## Glossary

| Term | Definition |
|------|-----------|
| **Worktree** | Git worktree: isolated checkout, separate branch, linked to main repo |
| **Feature Branch** | `feat/*` or `wip/*` branch for isolated work on a node |
| **DAG** | Directed acyclic graph: head.json structure defining nodes, edges, phases |
| **Consolidation** | Merging multiple independent DAGs into single unified head.json |
| **Brief** | Sealed agent context: nodeId, produces, consumes, description, no full DAG |
| **Handoff** | Agent output: status, decisions, gotchas, next agent reference |
| **Head.json** | Authoritative DAG file on main branch (read-only via pre-commit hook) |
| **Batch** | Set of parallel nodes currently executable (position is always a batch) |
| **Phase** | Logical group of nodes representing a work stage |
| **Orient** | Snapshot position (batch, level) from filesystem state |
| **Complete** | Mark node done: validate produces, record in trail |
| **Trail** | Append-only log of all orient/complete calls across sessions |

---

**End of Protocol Specification**
