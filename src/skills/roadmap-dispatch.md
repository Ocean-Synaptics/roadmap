<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-dispatch

Allocate nodes to agents for parallel execution. Run this before spawning swarm workers.

Dispatch is the transition from single-agent execution to multi-agent swarm. A DAG batch contains N independent nodes — nodes with no data dependencies between them, only shared predecessors. Dispatch assigns each node to an agent, ensuring exclusive ownership: agent A writes node A's produces, agent B writes node B's produces, no overlap. Without dispatch, two agents might both claim the same node, or one agent might read files another is actively modifying.

The `--assign` flag is non-negotiable because it solves three problems that manual assignment cannot: (1) conflict detection — if two nodes produce overlapping files, `--assign` clusters them to the same agent instead of creating a write race; (2) data-flow clustering — nodes that share outputs or ambient context go to the same agent, reducing cross-agent coordination; (3) claim serialization — `--assign` writes `.roadmap/claims.json` atomically, preventing the race condition where two orchestrators assign the same node to different workers. Hand-assigning nodes bypasses all three guarantees.

## Arguments
- `intent` (required): What the swarm is accomplishing. Becomes the orient --note.
- `owners` (optional): Comma-separated agent names for assignment. If omitted, --assign auto-allocates.

## Steps
1. Run: `$ROADMAP_BIN orient --assign --note "$intent"` (append `--owners $owners` if provided).
2. Parse the assignment output: agent-to-node mapping, conflict resolution results.
3. Run: `$ROADMAP_BIN orient --next` — identify the next batch for pre-warming.
4. For each assignment, return: `{ nodeId, owner, produces[], consumes[] }`.
5. Orchestrator spawns agents with their assigned node IDs. Each agent runs the swarm worker preamble:
   - `$ROADMAP_BIN orient --note "<node-id> — <verb> <what>: <one-line rationale>"`
   - `$ROADMAP_BIN orient --ready`
   - `$ROADMAP_BIN orient --next`
   - `$ROADMAP_BIN claim <node-id> --owner <agent-id>`
   - Work via `/roadmap-work` + `/roadmap-done`
6. Spawn the `--next` batch agents immediately for pre-warming while the current batch runs.

**Future: compile-prompts integration.** When `compile-prompts` ships (FR-COMPILE-PROMPTS), step 2 gains prompt compilation:
- Run: `$ROADMAP_BIN compile-prompts --env environment.md --batch current`
- Each assignment includes `{ nodeId, owner, promptPath }` — agents spawn with pre-compiled prompts.

## Contract
- **Do not hand-assign nodes.** `--assign` resolves conflicts, clusters by data flow, and writes claims atomically. Bypassing it creates write races and ownership ambiguity.
- **Never spawn coordination agents.** The DAG coordinates. One layer of agents max. An agent that spawns agents is a coordination agent — the DAG already fills that role.
- **Pre-warm the next batch.** Spawn `--next` agents immediately so they load context while the current batch executes. Pre-warming is not speculative — these agents will run as soon as the current batch closes.
- **Spawn when:** 3+ independent units, zero shared context, each described by consumes/produces, parallelism gain > coordination cost.
- **Don't spawn when:** single-agent with full context is better than 5 with partial. Default is single-agent. Write-test-fix catches integration bugs that parallelism misses.
- **Workers read only consumes.** Each worker reads only files listed in its node's `consumes`. The contracts are the interface — workers do not explore upstream, do not browse the repo, do not read other workers' produces.
- **Orient note format is machine-parseable.** Workers use: `"<node-id> — <verb> <what>: <one-line rationale>"`. Good: `"electron-db — writing SQLite CRUD layer: shared/types.ts consumed, produces electron/db.ts"`. Bad: `"working on database"`.
