# skills

Companion skills for the `roadmap` CLI. Each subdirectory contains a single `SKILL.md` describing one slash command.

## Index

```
  skill              purpose
  ────────────────── ────────────────────────────────────────────────────────────────
  roadmap-spec       Generate a convergence-oriented spec.json from intent + scope
  roadmap-orient     Self-orient at session start — position, fleet state, next move
  roadmap-auto       Autonomous execution of a DAG with rich progress reporting
  roadmap-term       Terminal-node assessment — convergence, review, successor spec
  core-loop          Iterate-upstream-propagate-downstream discipline on RED outcomes
```

The four `roadmap-*` skills are tool-specific. `core-loop` is generic research-grade
discipline that the roadmap engine triggers automatically when a node lands RED;
it stands alone as well.

## Install

The skills are plain markdown with YAML frontmatter. Drop them into your agent's
skills directory:

```
  agent stack          install path
  ──────────────────── ────────────────────────────────────────
  Claude Code          cp -r skills/* ~/.claude/skills/
  custom harness       point your skill loader at this directory
```

Each skill is self-contained — copy individually if you only want a subset.

## Authoring

Skills follow the standard frontmatter contract: `name` and `description` at the
top, body in markdown. The description is what the dispatcher matches against
user intent, so keep it specific and trigger-shaped ("invoke when X").
