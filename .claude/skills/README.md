# skills

Companion skills for the `roadmap` CLI. Each subdirectory contains a single `SKILL.md` describing one slash command.

## Index

```
  skill              purpose
  ────────────────── ────────────────────────────────────────────────────────────────
  roadmap-orient     Self-orient at session start — position, fleet state, boot prompt,
                     next move. Entry point and re-entry point.
  roadmap-spec       Generate a convergence-oriented spec.json from intent + scope ·
                     ships default code stance · ends with pointer to /roadmap-bootprompt
  roadmap-bootprompt Author .roadmap/heads/r<N>.boot.md — round-scoped cognitive cartridge
                     carrying Stance + Watch from the drafting session
  roadmap-auto       Autonomous execution · convergence stance · iterate-loop on RED ·
                     verdict ladder (GREEN/AMBER/RED/GBD/HONEST-RED/BLOCKED) ·
                     post-GREEN sniff · outcome vocabulary · trajectory patterns ·
                     terminal review inline (assess · threads · present · successor)
  roadmap-term       Assess convergence, review session, write successor, close cleanly
```

The chain: `orient → auto → (terminal inline) → spec → bootprompt → orient`.

Round-carrier discipline lives in roadmap-auto (where the loop runs and HONEST-RED
fires). Spec consumes carriers via `inputs[]` of the successor and narrates them in
`dag_desc / Round`. Skill-as-floor: every dispatch brief carries a default code stance
(subtract before adding · extend don't bolt · thin > fat · ~400 LOC) regardless of
whether the host project has a tuned CLAUDE.md.

## Canonical source + symlink convention

**This directory is the canonical source of the roadmap skills.** The
`roadmap-*` skills here are the single source of truth:

```
  roadmap-orient · roadmap-spec · roadmap-bootprompt · roadmap-auto ·
  roadmap-term · roadmap-diffuse-shortfall
```

Consuming repos (e.g. fleet at `/home/griffin/src/fleet`) are meant to
**symlink** to these, not copy. A symlink tracks upstream; a copy drifts the
moment either side is edited, and a single source of truth is the entire point
of consolidating them here.

A consumer repo wires one skill like this:

```sh
ln -s /home/griffin/src/.dev/roadmap/.claude/skills/roadmap-spec \
  <consumer-repo>/.claude/skills/roadmap-spec
```

Or symlink every canonical `roadmap-*` skill in a loop:

```sh
src=/home/griffin/src/.dev/roadmap/.claude/skills
dst=<consumer-repo>/.claude/skills
mkdir -p "$dst"
for s in "$src"/roadmap-*/; do
  ln -sfn "$s" "$dst/$(basename "$s")"
done
```

**Copying is a stopgap that causes drift** — only fall back to `cp -r` when a
target cannot follow a symlink (e.g. a sandbox that resolves links outside its
root). If you copy, re-sync against this directory whenever it changes.

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
