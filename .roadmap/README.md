# .roadmap/ — DAG state directory

This directory holds the roadmap engine's on-disk state. It has two roles:

## 1. Curated example (tracked)

```
.roadmap/heads/example-public-release.json
```

A small illustrative DAG (~12 nodes) showing the protocol shape: an `init`,
a scrub-cluster, a curate-cluster, two verifiers, a terminal, and a
plan-mode child. It is the same DAG the maintainer used to drive this
repo's public-release round, scrubbed and shipped as a worked example.

Read it alongside the top-level README's quickstart:

```bash
roadmap orient --note "explore the example"
```

## 2. Runtime state (gitignored)

When you run `roadmap make`, `orient`, and `advance` in your own repo,
the engine writes:

```
.roadmap/head.json                  active DAG
.roadmap/heads/<dagId>.json         active and archived DAGs
.roadmap/completed.json             completion receipts
.roadmap/trail.jsonl                event log + mutations
.roadmap/.handoff/<nodeId>.json     per-node handoff data
.roadmap/round-*/                   per-round receipts
.roadmap/tasks/                     task scratch
.roadmap/*.local.json               local-only sidecars
```

All of this is gitignored — see the project `.gitignore`. It accumulates
on your machine as you run the engine; it is your dogfooding trace, not
the project's source of truth.

This repo is the project dogfooding itself: the example DAG is a curated
artifact, and live runtime state from the maintainer's own runs lives
under the same paths but is excluded from version control.
