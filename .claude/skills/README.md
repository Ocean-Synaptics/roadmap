# skills

Companion skills for the `roadmap` CLI. Each subdirectory contains a single `SKILL.md` describing one slash command.

## Index

```
  skill              purpose
  ────────────────── ────────────────────────────────────────────────────────────────
  roadmap-spec       Generate a convergence-oriented spec.json from intent + scope ·
                     includes round-carriers discipline for residuals at HONEST-RED
  roadmap-orient     Self-orient at session start — position, fleet state, next move
  roadmap-auto       Autonomous execution of a DAG · includes the convergence stance
                     (endogenous-vs-exogenous) and the iterate-loop procedure on RED
  roadmap-term       Terminal-node assessment — convergence, review, successor with
                     named carriers
```

The iterate-loop discipline (diffuse → asymptote test → scope-widen-once → upstream →
re-validate → HONEST-RED with named carriers) lives split across the three skills it
spans: runtime in roadmap-auto, carrier authoring in roadmap-spec, round-close
enforcement in roadmap-term.

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
