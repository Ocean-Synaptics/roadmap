---
name: roadmap-spec
description: Generate convergence-oriented roadmap specs
user-invocable: true
---

# roadmap-spec

A spec is a bet: *if I execute these nodes in this order, I satisfy this intent.*

Intelligence lives in the spec. Pack thinking into compile-time, not runtime. A lightweight spec produces lightweight agents.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## The schema

```ts
interface NodeSpec {
  id:        string;                  // required · slug · concern-prefixed
  desc:      string;                  // required · line 1 = plain-English title
  produces:  string[];                // required · artifacts this node creates
  consumes:  ConsumeSpec[];           // required · artifacts this node reads
  validate:  ValidationRule[];        // required · acceptance gates
  mode?:     'execute' | 'plan';      // optional · default "execute"
  sidecar?:  Record<string, unknown>; // optional · ad-hoc per-node context
}
```

Five required, two optional. Nothing else.

INVARIANT · **a field is first-class iff the engine reads it and branches.**
Everything else — context files, source coordinates, author notes, domain
knowledge, round-level facts — lives under `sidecar.{}`.

ORDERING · **every ordering edge is a `consumes` of an upstream `produces`.**
If a gate has no artifact, the upstream node grows one — typically a
ratification receipt at `.roadmap/round-N/<upstream-id>.json` that
downstream nodes list under consumes. Logical-prereq-without-artifact
is not a thing.

```bash
roadmap api make    # live schema · check shape before authoring
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Read what came before

```
.roadmap/heads/*.json         archived DAGs
.roadmap/heads/*.boot.md      prior boot prompts · cognitive residue from prior sessions
.roadmap/trail.jsonl          what actually happened
.roadmap/.handoff/*.json      what agents discovered
```

Before writing, scan 2-3 recent completed DAGs for shape, validators,
decomposition idiom, friction (`grep` trail for advance rejections).
Read the most recent boot.md — it carries the prior session's stance,
drift-prevention, and round context.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Spec-time observation discipline · the load-bearing change

**Observations happen DURING spec authoring, in conversation with the user
— NOT as an O-thread in the DAG.**

The anti-pattern: open every round with 6-8 observation nodes that dispatch
agents to read files the orchestrator and user could answer in 30 seconds
together. Findings then required dag.insert, invalidating the DAG, surfacing
blockers, stalling execution. ~500K tokens per round of pure waste.

```
no node enters the spec until its premise is grounded.

  if the premise is "we need to know X" — author + user resolve X
  in conversation BEFORE the spec compiles. dag_desc embeds the
  finding. no observation node.

  if the premise is "we need to discover X by running code" — that
  IS the node. it's a discovery node, not an observation node. it
  produces an artifact other nodes consume. one such node, not six.

  if the premise is genuinely unknown until execution — use a
  plan-mode node. its expansion at runtime IS the observation.
```

The test: *"could the user and I have answered this question in conversation
in 5 minutes?"* If yes, no observation node — answer it now, embed in dag_desc.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## dag_desc shape · the spec's plain-English face

Every spec carries TWO names like every node does — an `id` (slug for the
engine, e.g. `r7-extract-pipeline`) and a plain-English title (first line
of `dag_desc`). The title is what users read in orient output, in the boot
prompt render, in fleet listings. **If a human can't read the spec aloud
and understand what it does, the spec failed before it compiled.**

REQUIRED SHAPE for `dag_desc`:

```
<Plain-English title — one line, capability-shaped, ≤ 80 chars>

## Intent
<what the human is actually asking for · the need, not the implementation>

## Scenario
given <starting state>
when  <the human acts>
then  <the human can ___>

## Round
<round number · falsifier this round must satisfy · carriers inherited from prior round>

## Authority map
| domain          | directories                  | allowed                  | forbidden                |
|-----------------|------------------------------|--------------------------|--------------------------|
| <name>          | <paths>                      | <change classes>         | <change classes>         |

## Stance pointers
<artifacts that encode the project's quality standard · CLAUDE.md sections · doctrine files>

<narrative body · risks · boundaries · what's known vs what's unknown>
```

The title + Intent + Scenario block are load-bearing — the `/roadmap-bootprompt`
skill renders the boot.md scaffold from them. If they're missing or vague,
the boot prompt is decorative.

GOOD vs BAD titles (same rule applies to dag_desc line 1 and node desc line 1):

```
✗ "r7-extract-pipeline"                        (slug, not English)
✗ "Implement the extraction module"            (task-shaped, no capability)
✗ "Round 7"                                    (batch vocabulary, opaque)

✓ "Extract pipeline records from the legacy database into typed JSON"
✓ "Verify the dashboard renders eerie-and-clickable against the design spec"
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Authority map · directory → domain ownership

Parallel workers collide when scope is permissive. The fix lives upstream
of dispatch: **the spec declares which directories belong to which domains,
and every node declares its target domain.** Dispatch then becomes
collision-safe by construction.

REQUIRED in `dag_desc / Authority map`:

```
| domain          | directories                  | allowed                            | forbidden                            |
|-----------------|------------------------------|------------------------------------|--------------------------------------|
| api             | src/api/                     | route handlers, types, middleware  | direct DB writes, auth changes       |
| auth            | src/auth/                    | auth flow, token handling, JWT     | API routes, DB schema                |
| db              | src/db/, migrations/         | schema, migrations, queries        | API surface, auth flow               |
| test            | test/                        | test fixtures, helpers             | source code under src/               |
```

Domains are **semantic ownership**, not file extensions. A domain has a
purpose, a directory set, and explicit allowed/forbidden change classes.

REQUIRED on every node: `sidecar.domain = "<domain-name>"`. The brief
inherits the domain's allowed/forbidden from the authority map automatically
(see /roadmap-auto · brief contract · section 2 CONTEXT).

```jsonc
{
  "id": "api-add-search-route",
  "desc": "Add /search endpoint to the catalog API\n\n...",
  "produces": ["src/api/routes/search.ts", "src/api/types/search.ts"],
  "consumes": [...],
  "validate": [...],
  "sidecar": {
    "domain": "api"     // ← cross-references dag_desc Authority map
  }
}
```

**Single-domain rule (enforced by /roadmap-auto):** one domain per node.
Cross-domain changes are split into multiple nodes wired by produces/consumes.
The orchestrator dispatches in parallel ONLY when target domains are disjoint;
overlapping domains serialize.

**Anti-patterns:**
- a node with no `sidecar.domain` declared → unsafe to dispatch in parallel
- a node whose `produces` paths span multiple domains → split it
- an authority map with one domain covering the whole repo → not a map,
  a non-statement · split into real domains

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Investigation is always plan-mode

"Fix the dashboard" hides two phases: investigate (broad reads, hypothesis
formation, root-cause routing) and fix (narrow write, scoped to the finding).
**These are different shapes of work and belong in different nodes.**

Today's anti-pattern: a single execute-mode node "fix the dashboard" sends
a worker that reads 50 files (broad scope, undeclared), forms a hypothesis,
and writes 2 files (narrow scope). The investigation is invisible to the
orchestrator, scope is illegible, parallel dispatch is unsafe.

**Discipline:** investigation is *always* a plan-mode node.

```
plan node      "Investigate <symptom> · identify root cause and fix scope"
               mode: plan
               produces: .roadmap/round-N/<id>.finding.json
               consumes: <relevant upstream artifacts>
               sidecar.domain: <usually the domain that owns the symptom>

→ at runtime, the plan expands into:
  · fix node(s) consuming finding.json
  · each fix node is execute-mode, single-domain, narrow scope
  · domain assignment falls out of the finding (which directory needs touch)
```

The `finding.json` schema:

```json
{
  "node":        "<plan node id>",
  "symptom":     "<one line>",
  "root_cause":  "<one line · what's actually broken>",
  "fix_scope":   [
    { "domain": "api",  "files": ["src/api/foo.ts"],  "change": "rename param" },
    { "domain": "auth", "files": ["src/auth/jwt.ts"], "change": "fix expiry calc" }
  ],
  "evidence":    ["<paths or excerpts that justify the finding>"]
}
```

Each `fix_scope` entry becomes a fix node in the expansion. Each fix node
is single-domain. The orchestrator can dispatch them in parallel if domains
are disjoint, serialize if not.

**Why this matters for collisions:**

```
without plan-mode investigation:    one fat node reads broadly, writes narrowly,
                                    in undeclared scope, collides freely

with plan-mode investigation:       investigation runs solo (no parallel reads
                                    on the same files), produces a structured
                                    finding, fix nodes have tight scope by
                                    inheritance, dispatched parallel-safe
```

**The test:** if a node's description starts with "fix" / "find" / "figure
out" / "investigate" / "diagnose" — it's a plan node. If it starts with a
specific imperative (`add`, `rename`, `move`, `delete`, `extract`, `verify`)
naming concrete files — it's an execute node.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Plain-English names at the node level

Every node carries TWO names: an `id` (slug for the engine) and a plain-English
title (first line of `desc`, for humans). Both required.

```
id          concern-prefixed slug · machine-readable · stable
            e.g. c-compile-schema · p-parse-records · v-verify-dashboard

title       first line of desc · plain English · capability-shaped · ≤ 80 chars
            reads like a sentence a non-author could repeat back

body        rest of desc · scenario · stance · risk · receipt path · validator rationale
```

REQUIRED SHAPE for every `tasks[].desc`:

```
<Plain-English title — one line, capability-shaped>

<scenario · stance · risk · receipt path · doctrine pointers>
```

The test · read the DAG to a stranger. If they can follow the story from
titles alone, the spec is load-bearing for humans. If they need to ask
"what does c-compile-schema mean," the title failed.

A spec that ships nodes without plain-English titles is redirected before
compile · titleless nodes are unreviewable.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Terminal node · the falsifier

Every DAG has a terminal node — the node that produces nothing further and
whose `validate[]` array IS the falsifier for the spec's bet. **Terminal
validators are not optional and not "artifact-exists" placeholders.** They
encode the executable form of dag_desc's `Scenario.then`.

```
dag_desc Scenario:    given X · when Y · then human can Z
terminal validate:    a shell command that proves Z holds against real artifacts
```

If the spec has multiple natural leaves, author a `t-review` terminal node
that consumes every leaf's produces and runs the falsifier. Do not rely on
synthetic `_term` to host the falsifier — synthetic term is engine bookkeeping,
its validate is empty, and an empty validator is a coasting GREEN waiting
to happen (see /roadmap-auto · verdict ladder · post-GREEN sniff).

```
weak terminal   { type: "artifact-exists", target: "dist/main.js" }
                            ↑ structural validator, behavioral claim. false GREEN.

strong terminal { type: "shell",
                  command: "curl -fs localhost:3000/api/health | jq -e .ok" }
                            ↑ exercises the thing the way a human would.
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Default code stance · the floor

Specs ship a default stance unless the project overrides via stance artifacts
listed in `dag_desc / Stance pointers`. These travel with every dispatch brief
(see /roadmap-auto · brief contract · STANCE slot):

```
1. Subtract before adding.   Removing a surface > handling a case.
                             The absent line cannot fail.

2. Extend, don't bolt.       Adding flags/branches to existing fns is a
                             refactor signal · the existing shape is the
                             actual subject of the change.

3. Thin and long > short and fat.   Linear sequential code > dense nested
                                    cleverness. Cognitive density per line
                                    is the metric, not line count.

4. File sizing.              ~400 LOC goldilocks · under 100 suspicious ·
                             over 800 refactor pressure. 10-40 functions
                             per file, each doing one thing.

5. Functions.                10-40 lines · one responsibility · guards first ·
                             max one nesting level.

6. Delete completely.        Dead branches, unused imports, obsolete shims.
                             No "removed" comments, no _-prefixed stubs.
```

These are the floor, not the ceiling. If the project's CLAUDE.md or docs/
encode a tighter stance, that overrides via stance pointers. If they don't,
these still travel.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Compile vs runtime

```
compile time    intent · scenario · stance · risk · shape · validators · doctrine
                survives sessions · IS the thinking

runtime         service state · prior-node findings · session traps · agent judgment
                ephemeral · dies with the session

shared          stance sharpens per dispatch · risk grows as observations land ·
                doctrine re-emphasizes per node
```

Anything that CAN be encoded at compile time SHOULD be.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## 🗂️ Knowledge surface · choose the right slot

The spec is not a config file. The spec is a typed knowledge graph.
Slots have access patterns. Authors choose by kind × access × durability.

SLOTS
  inputs[]              immutable substrate · sha-pinned · participates in compile_hash
  dag_desc              prose · intent · scenario · stance · round · narrative
  tasks[].sidecar.{}    structured per-node facts · jq-queryable · engine-ignored
  validators            claim-category-matched checks
  receipts              per-node completion JSON at .roadmap/round-N/<id>.json

CHOOSE BY KIND × ACCESS × DURABILITY
  immutable + hashable             → inputs[]
  prose narrative                  → dag_desc
  per-node structured fact         → tasks[].sidecar.{}
  durable across rounds            → CLAUDE.md or skill

§Sidecar-promotion-rule · when a sidecar key recurs across 3+ specs ·
promote to first-class engine schema. Sidecars are honest interim slots.
Discipline is in WHEN to promote · not in avoiding sidecars.

ANTI-PATTERN · re-passing the same fact through every node's sidecar.
If the SSH host appears in 8 nodes, either every node truly needs it
(keep) or one upstream node should produce a config receipt downstream
nodes consume (collapse).

💀 *Permissive fields become knowledge stores · place them deliberately.*

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Rounds · what they are, named honestly

A round is a falsifier plus the contiguous chain of DAGs aiming at it.
Rounds open when the falsifier is declared, close when the falsifier is
satisfied OR when HONEST-RED ships named carriers to the next round.

```
node     intra-DAG · validator failure · fix-and-retry within a single node
DAG      inter-DAG within round · successor proposed, same round
round    cross-round · carriers named, falsifier survives boundary
```

Round encoding (optional but recommended):

```
dag-id prefix       r<N>-<concern>    e.g. r7-extract-pipeline
dag_desc / Round    "Round 7 · falsifier: <one line> · carriers from r6: X, Y, Z"
sidecar.round       round number (forward-compat for future engine support)
```

The round number is human-assigned at spec time. Agents do not auto-increment.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Meta-DAGs

Plan-mode nodes carry the INTENT of a phase. The executing agent decomposes
into concrete sub-nodes informed by what's true at execution time.

```
spec encodes        what to prove
observation encodes what's true (in conversation, embedded in dag_desc)
expansion encodes   how to get there (runtime, in plan-mode children)
```

Flat nodes = you guessed the decomposition at spec time. Plan nodes = the
decomposition emerges from runtime knowledge. Plan-mode preferred wherever
uncertainty lives.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Fleeted lanes

Independent concerns → separate DAGs in separate worktrees. `fleet.json`
registers each lane. Each worktree has its own `.roadmap/head.json`. Three
lanes = three parallel sessions = 3× throughput.

When to fleet: concerns touch different files → fleet. Concerns share a
critical-path dep → same DAG.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Sizing

```
real work        30-35 nodes minimum per lane
under 20         hasn't been thought through
over 80          split into lanes or successors
with meta-DAGs   15-25 top-level nodes; expansion adds 8-15 per plan
```

The spec is heavyweight by design. Every node desc carries full context.
Every validator encodes a real check. Every scenario traces to root intent.

## Banned · batch vocabulary

Streaming dispatch is the execution model. The spec does NOT pre-partition
nodes into waves.

```
❌ BANNED in node ids       B0-<name> · B1-<name> · B2-<name>
❌ BANNED in dag_desc        'batch' · 'wave' · 'depth-layer' · 'synchronization barrier'
❌ BANNED in node desc       'after batch N completes' · 'parallel with B1'

✓ REQUIRED                   concern-prefixed ids (c-compile · p-parse · v-verify)
✓ REQUIRED                   ordering via consumes ↔ produces · gates with no
                             artifact get a ratification receipt upstream
✓ REQUIRED                   cluster in dag_desc by CONCERN not BATCH
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## What kills specs

```
1. assumption-first       builds before observing.
                          fix: ground premises in conversation before compile.

2. boundary blindness     implements without probing seams.
                          fix: ask what breaks at every boundary; answer in dag_desc.

3. weak validators        "it compiles" as proof.
                          fix: validator answers "how would a human check?"

4. self-graded success    agent writes intent, agent grades intent.
                          fix: intent validators on plan nodes only;
                          execute nodes use shell validators against real artifacts.

5. shallow testing        presence mistaken for function.
                          fix: validator checks RESPONSE, not PRESENCE.

6. anemic specs           too few nodes · no plan-mode · no lanes.
                          fix: push knowledge into the spec violently.

7. observation-thread     opening the round with N read-only agents.
                          fix: observations are author-time conversations, not nodes.

8. empty terminal         the terminal node's validate is [].
                          fix: terminal carries the falsifier · shell command
                          that exercises the scenario.then.

9. permissive scope       no authority map · no node domains · workers collide.
                          fix: declare authority map in dag_desc · every node
                          gets sidecar.domain · single-domain rule per node.

10. investigation in      "fix the X" as one execute-mode node hides broad
    execute mode          reads behind narrow writes · unsafe for parallel.
                          fix: investigation is plan-mode producing finding.json ·
                          fix nodes consume finding.json with tight inherited scope.
```

## Writing the spec · checklist

```
shape          observe-in-conversation → implement narrow → verify wide
nodes          self-contained · one concern · falsifiable · heavyweight desc
titles         first line of desc is plain English · ≤ 80 chars · capability-shaped
descs          scenario form · then = a CAPABILITY the human gains
validators     match category of claim · structural→structural · behavioral→behavioral
terminal       validate[] holds the falsifier · executable form of scenario.then
dag_desc       title + Intent + Scenario + Round + Authority map + Stance pointers
authority      every node has sidecar.domain cross-referencing the authority map
investigations all "fix/find/investigate" work is plan-mode · produces finding.json
receipts       node desc states "receipt to .roadmap/round-N/<id>.json"
```

## Before submit

```
approve    premises grounded in conversation · embedded in dag_desc.
           every validator invokes a produce.
           terminal carries the falsifier (shell, not artifact-exists).
           descs are scenarios, not tasks.
           dag_desc opens with plain-English title + Intent + Scenario.
           Authority map declares directory → domain ownership.
           every node has sidecar.domain set.
           investigations are plan-mode producing finding.json.
           independent concerns are fleeted.

redirect   observation-thread present · implementation-first ·
           validators don't name produces · terminal validate is [] ·
           descs describe files not capabilities · under 20 nodes ·
           any node missing a plain-English title on line 1 of desc ·
           any node missing sidecar.domain ·
           any node whose produces span multiple domains ·
           any "fix/find/investigate" node in execute-mode ·
           dag_desc missing Authority map · anemic.

stop       boundaries unknown · intent unclear · no archived heads read.
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Create

```bash
roadmap make docs/<dag-id>.spec.json --note "<intent>"
```

## Closing ritual · ALWAYS chain to /roadmap-bootprompt

Before returning control to the user, **invoke `/roadmap-bootprompt`**.

The spec encodes what to prove. The boot prompt encodes the cognitive
stance from THIS drafting session — drift-prevention, dead ends, register,
user concerns. It dies with the session unless captured now. A fresh agent
in a future session loads boot.md via `/roadmap-orient` and inherits both.

```
chain:  /roadmap-spec → roadmap make → /roadmap-bootprompt → user
```

Skipping this step strands the cognitive residue. Do not skip.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

💀 *The spec is the bet · the terminal is the falsifier · the boot prompt is the stance.*
