---
name: roadmap-auto
description: Autonomous roadmap execution with rich reporting
user-invocable: true
---

# roadmap-auto

The DAG executes itself. The node desc IS the agent brief. The orchestrator routes and synthesizes — does not do dirty work.

## Protocol · streaming dispatch

```
1. roadmap orient — position is truth.
2. dispatch every READY node (deps satisfied, not in-flight).
3. per node:
   produce → git add → commit → push → roadmap advance --note "<what>"
4. advance rejects? read error · fix produce · re-commit · retry. never skip validators.
5. any node completes → orient → dispatch newly-ready nodes immediately → repeat.
6. at term → /roadmap-term.
```

**No waves. No batches. No depth-layer synchronization.** `depends:` is the only ordering truth. When a predecessor completes, every node whose deps just closed is dispatchable in the same tick — they do not wait for sibling peers in an artificial cohort.

## The orchestrator is precious · stay out of the dirt

Context window is the scarcest resource. **The main conversation IS the dispatcher** — there is no separate "dispatcher subagent" to spawn, because subagents cannot spawn subagents. Only the main conversation has that capability. If the main conversation finds itself parsing 297KB orient output or reading 600-line receipts, the dispatch pattern is wrong.

**Direct worker dispatch.** Main conversation runs `roadmap orient`, summarizes the frontier internally, and:

```
- reads briefs in .roadmap/round-N/briefs/ for every READY node
- spawns one WORKER agent per node, parallel where independent
- each worker does: orient (own scope) → produce → write receipt → return ≤10-line status
  {node, verdict, artifacts, commits, surfaces, blockers}
- as workers complete, main re-runs `roadmap orient`, dispatches newly-ready nodes
- main NEVER reads raw orient output verbatim or raw agent receipts —
  only the ≤10-line status replies and the JSON receipt files via tight queries
```

Workers are leaves in the spawn tree. Routing, synthesis, and the next-frontier decision stay in the main conversation. For solo-ready dispatch, call the single worker directly.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 📡 Ambient context · read metadata first

before reading any node desc · read the spec's metadata.{}.
round-level facts live there. ssh hosts · file paths · toolchain locations ·
procedures to invoke on failure · policy declarations · gate declarations.

CONTRACT
  the dispatcher injects metadata into per-node briefs as ambient.
  briefs do NOT re-pass round-level facts that live in metadata.
  if a brief contains the SSH host string · the dispatch pattern is wrong.

PROCEDURES EMIT VERBATIM
  metadata.autonomy.ssh_resilience contains a literal reactivation
  command. on SSH failure · the agent OUTPUTS THAT STRING TO THE USER.
  no paraphrasing. no guessing at credentials. no skipping nodes.
  the procedure is graph-state · not training-state.

POLICIES GATE DECISIONS
  metadata.autonomy.human_window_nodes lists nodes requiring human window
  (human review · CI publish · etc).
  on encountering one autonomously · agent writes GBD-r(N+1) receipt
  with the named successor. no autonomous push.

READ ONCE · CACHE LOCALLY · DON'T RE-READ PER NODE
  metadata is round-level. reading once at orient is sufficient.
  re-reading per-node is the dispatch pattern smell.

💀 *Procedures live in the spec · not the agent.*

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Dispatching agents · brief contract

Briefs are small, structured, and bound. Agents do not need to be re-taught doctrine; they need scope, inputs, and verification gates.

```
brief shape (≤30 lines target)
──────────────────────────────
TASK         imperative verb + concrete outcome
INPUTS       file paths the agent reads (cite specifically; no "go look around")
PRODUCES     file paths the agent writes (must match node.produces)
SCOPE        allowed paths · forbidden paths · single-domain rule
VERIFY       command that confirms success
RECEIPT      .roadmap/round-N/<node-id>.json · structured · ≤30 lines · NO prose
ON-BLOCKED   STOP · output one blocking question · do NOT guess
```

## Convergence stance · keep head down, surface only what's exogenous

The default mode is convergence: when something fails, iterate. /core-loop fires on RED. Don't surface a blocker until you've genuinely exhausted what's in your hands.

```
ENDOGENOUS · keep head down · iterate
  validator rejects                · fix the produce, re-advance
  test fails                       · read the failure, fix the code
  schema doesn't match              · hoist the field, regenerate
  hypothesis falsified              · /core-loop · widen scope · upstream
  my code doesn't compile           · I write code, I fix code
  my receipt shape is wrong         · I author receipts, I fix shape

EXOGENOUS · surface · don't invent workarounds
  credentials I cannot provision
  hardware/host I cannot reach (and operator can)
  service genuinely down (not "I haven't figured out the API yet")
  human decision needed (and not a synthesis I can perform)
  disk full / network gone on a remote I do not control

DISCRIMINATOR · can I fix this with the tools I already have?
  yes  → keep head down · iterate · /core-loop on RED
  no   → surface, name the operator action verbatim, leave a BLOCKED
         receipt as a resume handle, walk to a parallel-ready spine
```

ANTI-PATTERN · throwing hands up before iterating. "I tried once and it failed" is not a blocker. "I cannot find a way through this in the time I have" is not a blocker either — it's an invitation to /core-loop. A blocker is a thing the world will not let you do, not a thing you haven't done yet.

§Convergence-default · agents iterate by default · escalation is the exception · the exception is named exogenous · everything else is endogenous.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Receipts · structured JSON, not prose markdown

Every receipt lives at `.roadmap/round-N/<node-id>.json`. Fixed slots:

```json
{
  "node": "<id>",
  "verdict": "GREEN" | "GBD-r<N+1>" | "BLOCKED",
  "artifacts": ["<paths>"],
  "commits": [{"repo": "fleet", "sha": "<hex>"}],
  "verify": {"cmd": "<...>", "exit": 0, "summary": "<one line>"},
  "carriers": [{"id": "<...>", "condition": "<...>"}],
  "notes": "<≤3 lines · only if truly needed>"
}
```

No narration. No tables. No color-field banners. The artifact + commit IS the evidence; the receipt indexes it. Terminal rubric reads JSON, synthesizes once.

If an agent writes a markdown receipt, the dispatch brief failed.

## Bound output explicitly

Every brief includes:

```
Receipt: ≤30 lines structured JSON to .roadmap/round-N/<id>.json.
No prose narration. No diagrams. No quoted doctrine. Voice tokens are pure loss.
Status reply to orchestrator: ≤10 lines.
```

## Decompose before GBD

GBD ("Green-By-Disposition") advances a node when residual work is explicitly dispositioned with named successor owners. It is **last-resort**, not first-resort cover.

Before writing a GBD receipt, ask: what portion of this node IS doable now? Dispatch on that portion. GBD only the residual.

The four GBD conditions (all required):

```
1. every residual has a NAMED round-N+1 owner (specific node-id, not vague)
2. receipt enumerates residuals (per-instance or per-cluster with counts)
3. consumer-migration is not skipped via GBD
4. validator relaxation is VISIBLE in the DAG (modify the node's validator)
```

Anti-pattern: relax validator without naming successor work = forged green.

## P0 motion check · between dispatch ticks

Node throughput is not progress. P0 motion is.

```
every N completions (N = max(3, frontier-width)) · re-read DAG root P0 list.
  any P0 observably moved?
    yes (≥1)              continue · orient · dispatch next frontier
    no · one tick          acknowledge · prefer tractable P0 subsets next
    no · two ticks in a row STOP · surface · do NOT compile next round
                            on top of untouched P0s
```

A round closing with stated P0s untouched is not converged · it is deferred.

## Reporting

Tight, informational. The user sees the DAG come alive without scrolling.

```
on orient
─────────
🔮 dag-name — B2 of 7 │ 5/14 done
B0 init ✅
B1 setup-db ✅ │ setup-auth ✅
B2 [api-routes] [middleware] ←── here
B3 integration │ B4 tests │ B5 term

on dispatch
───────────
B2 DISPATCHED · 2 parallel
🔧 api-routes    → src/api/routes.ts
🔧 middleware    → src/middleware/auth.ts

on batch complete
─────────────────
🟩 B2 ✅ │ next: B3 integration

on terminal
───────────
🟩 DAG COMPLETE — trajectory + successor proposal
```

## At terminal

```
read terminalContext.detectedGaps   remaining work
read terminalContext.rootIntent     what we're building toward
read successorProposal.action:
  converged    → done · tell the human
  continue     → write successor spec from specDraft · roadmap make
  orbit-break  → STOP · surface orbitDiagnosis to human
```

## Chain continuation

```
after writing successor spec:
  git checkout main && git merge <branch>
  roadmap make successor-spec.json --note "chain from <dag_id>"
  roadmap orient — begin next cycle

loop: work → term → successor → merge → make → orient → work
do not stop at "merge first" · complete the loop.
```

## Commit hygiene · scoped-add only

**Rule:** every agent brief MUST enforce `git add <explicit-paths>`. `git add -A` and `git add .` are forbidden in all agent commit sequences.

**Why:** parallel agents share the same working tree. Loose files staged by one agent sweep into another node's commit boundary, corrupting attribution and making receipt cross-checks meaningless.

**Protocol for loose files:** if an agent finds files staged or unstaged outside its declared `produces` list, it leaves them alone. It stages ONLY the paths it owns, commits, and notes the loose files in its receipt under `notes`. It does NOT unstage or stash foreign changes.

**Brief contract extension:** every dispatched brief must include an explicit COMMIT block:

```
COMMIT
  git add <path1> <path2> ...   ← explicit paths only · must match PRODUCES
  git commit -m "..."
  # NEVER: git add -A · git add . · git add --all
```

**Validator pattern:** receipts with a `commits` field should pair with `jq_probe_cmd` verifying the staged file count matches the node's `produces` length.

## Permissions

```
next moves approved · do not ask permission
merge to main approved
dispatch parallel background sonnet agents for batch nodes
expand plan nodes into subgraphs as encountered
```

## Two loops

```
DAG loop     orient → work batch → advance → orient again
agent loop   produce → inspect output → fix → produce again
             look at what you made · until it's right
```

## Chain

```
called after /roadmap-orient shows work
at terminal → /roadmap-term
chain: orient → auto → spec → term → orient
```
