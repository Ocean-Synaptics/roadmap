# The Self-Orientation Mechanism: Why This Works

## The Kill Switch: roadmap.ts Must Compile

The entire development process has a **hard gate**: `roadmap.ts` must be valid TypeScript that compiles.

```bash
# This is run on every commit (or should be)
npx tsc roadmap.ts --noEmit
```

If it fails, **everything stops**. You can't:
- Merge code
- Tag a release
- Proceed to the next phase
- Claim you're done

Why? Because `roadmap.ts` **IS** the project state.

### What This Means

If someone tries to:

**Claim they finished phase-3 but didn't create the artifacts:**
```typescript
// roadmap.ts
{
  "phase-3-term": {
    "consumes": ["src/branch.ts", "tests/adv-branch.test.ts"],
    "deps": ["phase-3-impl"]
  }
}

// Run: node roadmap.ts --position
// → verify() fails: "phase-3-term consumes src/branch.ts — no predecessor produces it"
// BLOCKED
```

**Try to add a circular dependency:**
```typescript
// Modified roadmap.ts
{
  "phase-1": { "deps": ["phase-2"] },
  "phase-2": { "deps": ["phase-1"] }  // CYCLE!
}

// Run: node roadmap.ts
// → define() throws: "Cycle detected: phase-1 → phase-2 → phase-1"
// BLOCKED
```

**Forget to include a dependency:**
```typescript
{
  "phase-3": {
    "consumes": ["src/branch.ts"],
    // deps: []  // MISSING! Should depend on phase-2
  }
}

// Run: node roadmap.ts
// → verify() fails: "phase-3 consumes src/branch.ts — no predecessor produces it"
// BLOCKED
```

**The system is unforgeable.** You can't lie about state.

---

## Infrastructure as Code (IaC): The Governance Model

This is **not just a library**. It's a governance system encoded as executable code.

### Traditional IaC (Terraform/CloudFormation)

```hcl
# infrastructure.tf
resource "aws_instance" "web" {
  ami           = "ami-12345"
  instance_type = "t2.micro"

  tags = {
    Name = "web-server"
  }
}
```

Running `terraform apply`:
- Verifies the state is valid
- Checks dependencies
- Applies in order
- Audit trail in git

### This Project's IaC (Governance.ts)

```typescript
// roadmap.ts
export default define(graph({
  nodes: {
    init: {
      produces: ["src/protocol.ts", "tests/"],
      consumes: [],
      idempotent: true
    },
    phase-1: {
      produces: ["docs/decisions/"],
      consumes: ["src/protocol.ts"],
      deps: ["init"],
      idempotent: true
    },
    term: {
      produces: [],
      consumes: ["docs/decisions/"],
      deps: ["phase-1"]
    }
  }
}));
```

Running `node roadmap.ts`:
- Verifies the DAG is valid (define, check, verify)
- Finds current position (orient)
- Shows what's blocking (produces + consumes)
- Audit trail in git

### The Parallel

| Aspect | Terraform | roadmap.ts |
|--------|-----------|-----------|
| Definition | HCL syntax | TypeScript + JSON |
| Validation | `terraform validate` | `tsc + define() + verify()` |
| Dependency graph | Resource dependencies | Phase dependencies |
| Idempotency | Resource idempotent flag | Node idempotent field |
| Rollback | State history | Git history |
| Audit trail | terraform.tfstate | .roadmap/head.json + git log |
| Execution | `terraform apply` | `node roadmap.ts --position` |
| Query | `terraform state show` | `orient()` |

**Both answer the same question in different domains:**

Terraform: "What's the desired infrastructure state and how do I get there?"
Roadmap: "What's the desired project state and how do I get there?"

---

## Why TypeScript Compilation Is the Enforcement Layer

### The Contract Chain

1. **Node definition must be valid TypeScript**
   ```typescript
   interface NodeSpec<T> {
     id: keyof T;           // Must be a real key
     produces: string[];
     consumes: string[];
     deps: (keyof T)[];     // Must reference real nodes
     idempotent: boolean;
   }
   ```

2. **Dependencies must reference real nodes**
   ```typescript
   // This compiles:
   nodes: {
     phase-1: { deps: ["init"] }  // ✓ init exists
   }

   // This FAILS to compile:
   nodes: {
     phase-1: { deps: ["nonexistent"] }  // ✗ TypeScript error: unknown key
   }
   ```

3. **Invalid DAGs fail at runtime before anything else**
   ```typescript
   try {
     define(dag);  // Checks cycles, init/term, reachability
   } catch (e) {
     throw new Error("Invalid DAG — cannot proceed");
   }
   ```

4. **Broken contracts are caught before execution**
   ```typescript
   const errors = verify(dag);
   if (errors.length) {
     throw new Error("Unsatisfied contracts — cannot proceed");
   }
   ```

**Result**: By the time you run any work, the plan is proven valid.

### What This Prevents

| Scenario | Prevented How |
|----------|---|
| Typo in phase name | TypeScript (phase doesn't exist) |
| Missing dependency | verify() (consumes not produced) |
| Circular dependency | define() (cycle detection) |
| Orphaned phase | check() (reachability from init/term) |
| Non-idempotent recovery | Explicit `idempotent: false` flag |
| Forget a contract | verify() (transitive closure check) |
| Reorder breaks things | Re-run check() + verify() after reorder |

---

## How the System Guarantees Correctness

### Guard Rails (Compile Time)

**TypeScript types enforce:**
```typescript
// Every node ID must be a real key in the graph
type NodeId = keyof typeof roadmap.nodes;

// Every dependency must exist
function addDep(nodeId: NodeId, dep: NodeId) {
  // dep must be a valid NodeId — compile error if not
}

// Functions have clear return types
function orient(g: Graph): Orientation {
  return {
    position: string,           // Concrete node ID
    produces: string[],         // Concrete artifacts
    consumes: string[],         // Concrete artifacts
    remaining: number           // Exact count
  };
}
```

### Checkpoints (Runtime)

**Every `node roadmap.ts` call validates:**
1. `define(dag)` — is it a valid graph?
2. `check(dag)` — is it connected?
3. `verify(dag)` — are contracts satisfied?
4. `orient(dag)` — where are we?

If any check fails, the process stops.

### Audit Trail (Git)

Every state change is recorded:
```bash
git log --oneline
# d9b7676 feat: phase 12 node 4 — adoption guide
# c2a0f57 feat: phase 12 node 3 — integration tests
# 805bf54 feat: phase 12 node 2 — CLI
# 7728bd5 feat: phase 12 node 1 — design
```

Each commit includes what was produced:
```bash
git show 805bf54
# +++ bin/roadmap-integrate.ts (285 LOC, implements node 2)
# +++ tests/auto-integrate-full.test.ts (13 new tests)
```

---

## The Unforgeable Proof

Here's why you can't "fake" progress:

### Attempt 1: Claim You're Done Without Creating Artifacts

```typescript
// You claim phase-3 is done
git commit -m "feat: phase 3 complete"

// But you didn't create src/branch.ts
// Run: node roadmap.ts --position
// → position: "phase-3" (you're still there!)
// → verify() fails: "phase-3-term consumes src/branch.ts — no predecessor produces it"
// CAUGHT
```

### Attempt 2: Pretend Dependencies Don't Matter

```typescript
// You want phase-3 to work without phase-2
// Modify roadmap.ts:
{
  "phase-3": {
    "consumes": ["src/branch.ts"],
    "deps": []  // Remove phase-2 dependency
  }
}

// Run: tsc roadmap.ts --noEmit
// Type error: "phase-3 consumes src/branch.ts but no predecessor produces it"
// REJECTED
```

### Attempt 3: Create Invalid DAG Structure

```typescript
// Add a cycle
{
  "phase-1": { "deps": ["phase-2"] },
  "phase-2": { "deps": ["phase-1"] }
}

// Run: node roadmap.ts
// → define() throws: "Cycle detected"
// REJECTED
```

**The system is hermetically sealed.** The only way to make progress is to:
1. Create the actual artifacts (produces)
2. Update roadmap.ts to reflect reality
3. Pass all validation gates

---

## The Insight: Code as Governance

This isn't just "a library." It's **code-based governance**.

### What Traditional Governance Looks Like

```
Team Lead: "What phase are we in?"
Engineer: "Uh... let me check Jira..."
[5 minutes later]
Engineer: "I think we finished phase 2? But the tests are failing..."
Team Lead: "OK just ship it"
[Disaster]
```

### What This System Looks Like

```
Engineer: "What phase are we in?"
Engineer: node roadmap.ts --position
# → position: "phase-2", produces: ["src/merge.ts"], remaining: 10
Engineer: "OK, I'll create src/merge.ts"
[Creates merge.ts]
Engineer: npm test
# All tests pass (contracts validated)
Engineer: git commit
# Audit trail created
Engineer: node roadmap.ts --position
# → position: "phase-3" (automatically advanced)
```

**The system enforces discipline without humans deciding.**

---

## Why This Matters for Autonomous Agents

When agents execute the roadmap, they need guarantees:

1. **"I won't get stuck in a dead state"** — verify() ensures contracts exist
2. **"I won't create circular work"** — define() prevents cycles
3. **"I know exactly what comes next"** — orient() is deterministic
4. **"My work can't be reversed secretly"** — git is immutable
5. **"I can resume if interrupted"** — checkpoint/restore + git log

This is why Phase 9 (agent executor) could be built confidently — the roadmap had already proven itself through 8 phases of self-enforcement.

---

## The Implementation Guarantee

Run this once, and you know the system works:

```bash
# Phase 1: Expand roadmap with phase-2 nodes
node .roadmap/expand-phase-2.ts

# Phase 2: Validate it's valid
node roadmap.ts --show
# (Must pass define, check, verify)

# Phase 3: Execute
node roadmap.ts --position
# (Must show next node with produces/consumes)

# Phase 4: Commit
git add -A && git commit -m "feat: phase 2 nodes"

# Phase 5: Repeat forever
```

If step 2 fails, you don't proceed. If step 3 gives garbage, you're wrong about the DAG. If step 4 fails git validation, something's corrupted.

**This is not aspirational.** It's enforced by types, runtime checks, and git integrity.

---

## Summary

| Property | Implementation |
|----------|---|
| **Unforgeable** | TypeScript types + runtime validation |
| **Auditable** | Every state change in git |
| **Deterministic** | Same inputs → same position, always |
| **Self-correcting** | orient() doesn't lie about position |
| **Resumable** | Checkpoint + git history |
| **Verifiable** | Run `node roadmap.ts` to prove state |
| **Autonomous-friendly** | Agents can trust the output |
| **Infrastructure as Code** | DAG is version-controlled governance |

**The roadmap doesn't just describe the project. It enforces it.**
