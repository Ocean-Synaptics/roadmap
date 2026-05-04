# roadmap · executive brief

## The problem

Agentic development produces enormous amounts of work and shockingly little durable structure. A long agent run leaves a wake of commits, half-finished refactors, half-tested branches, and a transcript that no one re-reads. When the next session opens, the first 30 minutes are spent re-orienting. When something breaks in production three weeks later, no one can name *what was supposed to happen* in the first place.

Teams reach for issue trackers, kanban boards, project-management tools, and CI dashboards — none of which know what the work *means*. They sit beside the code, not inside it. Claims of completion are unverifiable. Convergence is a feeling, not a fact.

## The thesis

**The graph is compiled execution state. The process is ephemeral; the graph is permanent.**

`roadmap` declares work as a typed directed acyclic graph. Each node names what it `produces` (files), what it `consumes` (files written by predecessors), and how to `validate` (shell commands, artifact checks, schema rules). Ordering falls out of the data flow — a node's consumes resolves against its predecessors' produces. There is no separate `depends` field, because the wiring already says it.

Position is computed from filesystem state. Which artifacts actually exist determines where you are. You cannot lie to the engine about completion: the validators run shell commands against real files, and `advance` rejects nodes whose validators don't pass.

The graph survives sessions. A new agent (or a new human) opens the repo, runs `roadmap orient`, and inherits exactly the position the previous session left. The execution log goes to `.roadmap/trail.jsonl`. The receipts of completion go to `.roadmap/completed.json`. Nothing is lost.

## What you get

| | |
|---|---|
| **Compile-time integrity** | TypeScript types reject unreachable nodes, missing init/term, dangling consumes |
| **Import-time integrity** | `define(g)` rejects cycles, missing wiring, structural drift |
| **Runtime integrity** | `verify(g)` confirms every consumed artifact is produced by some predecessor |
| **Position from state** | `orient(g, completion)` reads the filesystem, returns the current frontier |
| **Falsifiable completion** | `advance` runs validators against real artifacts; a node either passes or doesn't |
| **Streaming dispatch** | independent nodes run in parallel as soon as their consumes resolve — no batches, no waves |
| **Provenance** | every mutation, every advance, every brief recorded in append-only `.roadmap/trail.jsonl` |
| **Library + CLI** | use as a TypeScript module or as a standalone binary |

## Where it fits

- **Agent-driven development** — Claude Code, Cursor agents, custom Anthropic SDK harnesses. The DAG is the agent's working memory across sessions.
- **Multi-step refactors** — large mechanical changes where mid-state matters. The graph survives interruption.
- **Multi-repo workflows** — the optional `fleet` feature spans repos with shared frontier. Built for organizations running ML / robotics / large-codebase migrations.
- **Reproducible delivery** — every release is a tagged DAG completion; auditors read receipts, not git blame.

## What it isn't

- A task manager. Tasks are user-facing; nodes are typed contracts.
- A CI system. CI runs your validators; roadmap declares them.
- A workflow engine like Temporal or Airflow. Those orchestrate distributed services; roadmap orchestrates *work* against a filesystem.

## Maturity

`v0.2.0` is the first public release, presented as a poster at **ML Prague 2026** under the title *Compiling Agent State*. The protocol has been internally dogfooded across hundreds of rounds totalling ~3,500 advance events on multiple sibling repositories. The graph algebra is stable. The CLI surface (`make` / `orient` / `advance` / `dag` / `viewer`) is settled. Expect breaking changes at minor-version bumps until `v1.0`.

## Status & contribution

The repository is public; **issues are open**; **external PRs are deferred until ~2026-05-15** while the maintainer is at the conference. See [ROLLOUT.md](ROLLOUT.md) for the contribution timeline. After 2026-05-15, the contribution surface opens fully.

## How to evaluate it in five minutes

```bash
git clone https://github.com/Ocean-Synaptics/roadmap
cd roadmap && pnpm install && pnpm run build && pnpm link --global
mkdir /tmp/try && cd /tmp/try && git init -q
roadmap make /home/your-user/.../roadmap/examples/hello.spec.json --note try --skip-input-verification
roadmap orient --note try
echo hello > .roadmap/init.json
roadmap advance init --note "ratify"
roadmap orient --note try
```

You'll see the DAG advance from `init` to the `build` frontier. The complete walkthrough — including parallel batches and validators that actually fail — is in [examples/](../examples/).

## Contact

Issues for bugs and questions during phase 1. Author: Griffin Downs · Ocean Synaptics · griffin.downs@oceansynaptics.com
