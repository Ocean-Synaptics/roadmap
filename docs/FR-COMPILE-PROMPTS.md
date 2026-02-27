# FR: `roadmap compile-prompts` — generate per-node worker prompts from DAG + environment

## Problem

Dispatching worker agents requires assembling context per node: what files to read, what to produce, what domain boundaries to respect, what commands to run for verification. In iteration 1, each agent received a freeform description and had to reason about scope, contracts, and validation independently. Result: 99 agents, 10 integration bugs, 12% utilization.

The context assembly is derivable. `roadmap show <node>` already has produces, consumes, ambient, validate. The environment document has domain mapping, invariants, high-entropy zones. A structured prompt template maps these fields into a self-contained worker prompt. This mapping is mechanical — it should be a CLI command, not architect work.

## Architecture

Two reference documents, one per-node output:

```
environment.md (filled once per project)
  + prompt-template.md (reusable across projects)
  + roadmap show <node> (per-node DAG spec)
  = prompts/prompt-<node-id>.md (self-contained worker prompt)
```

### environment.md

Project-level reference document. Facts only, no code, no implementation guidance. Filled by an architect model (Opus) or human from:

| Section | Source |
|---|---|
| Project Identity & Constraints | pre-spec.md |
| Execution Reality | plan.md (commands, deps, services) |
| Architectural Invariants | constitution.md + postmortem findings |
| State Authority Map | DAG produces/consumes graph |
| Domain Map | `roadmap cluster --exclude-hubs` output |
| Core Entities | data-model.md |
| Test Harness | vitest/jest config, plan.md |
| High-Entropy Zones | postmortem (known seam bugs, fragile boundaries) |
| Semantic Bindings | spec.md vocabulary |

Staleness detection: `commit` + `date verified` fields. If HEAD differs, environment is stale.

### prompt-template.md

Per-node prompt structure. Execute-only — no opinions, no architecture, just artifacts. Fields:

1. **Task Definition** — imperative verb + concrete outcome (from `node.desc`)
2. **Context** — files/directories (from `consumes` + `ambient`), domain (from cluster membership), constraints (from environment invariants + high-entropy), commands (from `validate[]`)
3. **Scope Boundaries** — target domain, allowed to modify (`produces`), read-only (`consumes` + `ambient`), forbidden (everything else). Single-domain rule enforced.
4. **Required Artifacts** — code changes, tests, docs (from `produces` list + test node presence)
5. **Verification** — shell commands from `validate[]` mapped to checklist
6. **Failure Handling** — STOP if blocked, output one blocking question, no guessing
7. **Executor Instruction** — execute-only mode, no scope expansion, no adjacent refactoring

### compile-prompts output

Per-node markdown file at `prompts/prompt-<node-id>.md`. Self-contained — worker agent reads ONE file, has everything it needs. No spec reading, no DAG navigation, no environment scanning.

## Proposal

### Command: `roadmap compile-prompts`

```bash
roadmap compile-prompts --env environment.md --template prompt-template.md --out prompts/
roadmap compile-prompts --env environment.md --node <id>    # single node
roadmap compile-prompts --env environment.md --batch <level> # current batch only
```

**Algorithm per node:**
1. `show <node>` → structured node spec (produces, consumes, ambient, validate, desc)
2. Read environment.md → parse sections into field map
3. Read cluster output → resolve node's domain membership
4. For each template field, select source:

| Template field | Primary source | Fallback |
|---|---|---|
| Task Definition | `node.desc` | — |
| Files/directories | `node.consumes` + `node.ambient` | — |
| Domain | cluster membership → environment 6a | node.id prefix |
| Constraints | environment 4 (invariants) + 8 (high-entropy) filtered by domain | — |
| Entities | environment 6b filtered by `node.consumes` file overlap | — |
| Quick check command | first `validate[]` with type=shell | `tsc --noEmit` |
| Full validation command | all `validate[]` concatenated | — |
| Allowed to modify | `node.produces` | — |
| Read-only | `node.consumes` + `node.ambient` | — |
| Forbidden | environment 6a forbidden for this domain | — |
| Required artifacts | `node.produces` (code) + test file presence check | — |
| Test location | `node.produces` filtered to `tests/**` | — |
| Verification checklist | shell `validate[]` mapped to `[ ]` items | — |
| Intent self-check | `intent` `validate[]` mapped to annotated `[ ]` items with failure hint | — |

5. Fill template → write `prompts/prompt-<node-id>.md`

**Output (JSON):**
```json
{
  "compiled": 24,
  "skipped": 0,
  "outputDir": "prompts/",
  "prompts": [
    { "node": "electron-db", "path": "prompts/prompt-electron-db.md", "domain": "electron-core" },
    { "node": "renderer-store", "path": "prompts/prompt-renderer-store.md", "domain": "renderer" }
  ]
}
```

### Integration with dispatch

After compilation, dispatch is a loop:

```bash
roadmap compile-prompts --env environment.md --batch current
roadmap orient --assign --by-cluster --note "dispatching batch"
# For each assigned node:
#   Task(model: "haiku", prompt: read("prompts/prompt-<node-id>.md"))
```

Or automated:
```bash
roadmap dispatch --model haiku --env environment.md
```

`dispatch` = compile-prompts + orient --assign + spawn agents. Future FR — compile-prompts is the foundation.

### Intent self-check in the verification section

Intent rules from `validate[]` appear as annotated self-check items — not just "ensure X" but "here's what wrong looks like, here's what right looks like":

```markdown
## 5. Verification

### Deterministic (must pass before submitting)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run tests/unit/db.test.ts` exits 0

### Intent (self-check — these will be evaluated at confidence >= 0.9)
- [ ] "dark: variants use .dark class selector, not @media prefers-color-scheme"
      Check: grep built CSS for `:where(.dark` — if you see `@media (prefers-color-scheme:`
      instead, you used the wrong Tailwind 4 configuration.
      Fix: add `@custom-variant dark (&:where(.dark, .dark *))` to index.css

- [ ] "IPC channels match between preload contextBridge and main ipcMain.handle"
      Check: every key in IPC_CHANNELS used in preload.ts must have a corresponding
      handler in main.ts. Mismatched channel names produce silent failures at runtime.
```

The failure mode and fix come from the evaluation history for that statement (`readEvaluations(nodeId, statement)`). On first run, no hint is emitted — just the statement and threshold. After a failing judgment is recorded, subsequent compiles include the failure mode as a hint for the generator.

**Critically: history enriches prompts, never adjusts thresholds.** A statement that consistently evaluates at 0.72 against a 0.9 threshold means the generator is broken, not that the threshold is too strict. The fix is a better generator (via the hint) — not a lower bar.

The feedback loop:

```
spec → intent statements (what must be true)
  → compile-prompts (how to make it true + what wrong looks like, from history)
    → emit (generator follows enriched prompt)
      → intent evaluation (did it actually do it?)
        → pass: done
        → fail: judgment records failure mode → next compile includes it as hint
```

Each iteration's failures become the next iteration's prompt enrichment. Gates stay fixed. Prompts get more precise. Convergence = prompts encoding enough failure modes that the generator avoids all of them.

**Algorithm in compile-prompts:**
```typescript
for (const rule of node.validate.filter(r => r.type === 'intent')) {
  const history = readEvaluations(nodeId, repoRoot)
    .filter(r => r.statement === rule.statement)
  const lastFailure = history.filter(r => !r.pass).at(-1)

  emit(`- [ ] "${rule.statement}"`)
  emit(`      (threshold: ${rule.confidence}, evaluator: ${rule.evaluator})`)
  if (lastFailure) {
    emit(`      Known failure mode: ${lastFailure.reasoning}`)
    emit(`      Evidence: ${lastFailure.evidence.join(', ')}`)
  }
}
```

### Validation of compiled prompts

Before dispatching, verify prompt quality:
- Every `produces` path appears in "Allowed to modify"
- Every `consumes` path appears in "Read-only" or "Files/directories"
- Every `validate[]` shell command appears in "Verification"
- Domain field is non-empty
- No two prompts share a file in "Allowed to modify" (exclusive ownership check)

```bash
roadmap compile-prompts --env environment.md --validate-only
```

## Invariants

- Compiled prompts are deterministic: same DAG + same environment → same prompts
- Worker agents receive ONE file — no environment.md, no spec access, no DAG navigation
- Single-domain rule: each prompt targets one domain. Cross-domain detected at compile time, not runtime.
- Template is project-agnostic. Environment is project-specific. Prompt is node-specific.

## Scope

- New: `src/lib/compile-prompts.ts` — template filling engine
- New: `prompts/` output directory convention
- Modify: `bin/roadmap.ts` — `compile-prompts` command handler
- Ships with default `prompt-template.md` in roadmap install
- Tests: field mapping coverage, exclusive ownership validation, determinism, staleness detection

## Not in scope

- `roadmap dispatch` (automated spawn) — future FR, uses compile-prompts as foundation
- environment.md auto-generation from spec-kit — future FR
- Prompt quality scoring (readability, completeness heuristics) — future
- Multi-model prompt variants (different templates for Opus vs Haiku) — future
