# Setting up roadmap in your repo

Roadmap is a tool for governing execution as a DAG: plan once, execute in
parallel batches, validate every transition, and stop only when the graph
terminates. Setup is intentionally environment-specific — package managers
(`npm` / `pnpm` / `yarn` / `bun`), agent stacks (Claude Code / Cursor /
Aider / none), CLAUDE.md anchor conventions, monorepo vs solo-repo layouts,
and `.gitignore` policies vary widely. Rather than ship a script that tries
to enumerate every case, this document is LLM-runnable prose: paste the
relevant section into your agent, or read it yourself and adapt.

## TL;DR for Claude Code users

Open your target repo in Claude Code and paste this prompt:

```
Set up roadmap in this repo:
1. ensure .roadmap/ directory exists at the repo root
2. add or update CLAUDE.md to include the roadmap fragment from
   https://github.com/Ocean-Synaptics/roadmap/blob/main/templates/claude-md-fragment.md
3. write a starter spec at docs/<my-project>.spec.json describing the
   next 3-5 nodes of work (use `roadmap api make` for the schema)
4. run `roadmap make docs/<my-project>.spec.json --note "initial DAG"`
5. run `roadmap orient --note "begin"` and report the position
```

Claude Code will read your repo's existing CLAUDE.md (if any), pick a
reasonable place to merge the fragment, choose a spec filename that
matches your project, and propose nodes that fit your codebase.

## TL;DR for other agent stacks

Agent-agnostic version. Paste this into Cursor, Aider, Continue, or any
LLM with shell + file access scoped to your repo:

```
Install roadmap into this repository.

Context: roadmap is a CLI that governs work as a DAG. Repo is at
https://github.com/Ocean-Synaptics/roadmap. The CLI binary is `roadmap`.

Steps:
1. Verify `roadmap --help` runs. If not, install per the Manual setup
   section of docs/SETUP.md in the roadmap repo.
2. Create .roadmap/ at the repo root if missing.
3. Locate the project's primary agent-instructions file (CLAUDE.md,
   .cursorrules, AGENTS.md, etc). Append the contents of
   templates/claude-md-fragment.md from the roadmap repo, adapting any
   tool names to match the local convention.
4. Author a spec at docs/<project>.spec.json. Schema: `roadmap api make`.
   Include 3-5 nodes covering near-term work, each with produces[],
   consumes[], depends[], and a validate[] block.
5. Run `roadmap make docs/<project>.spec.json --note "initial DAG"`.
6. Run `roadmap orient --note "begin"` and surface the returned batch.
```

## Manual setup

For users without an agent, or for first-time installation of the CLI
itself.

Install the CLI (one-time, global):

```sh
git clone https://github.com/Ocean-Synaptics/roadmap ~/.local/share/roadmap
cd ~/.local/share/roadmap
pnpm install
pnpm run build
pnpm link --global
roadmap --help   # verify
```

(Once published to a registry: `pnpm add -g @ocean-synaptics/roadmap`.)

In your target repo:

```sh
cd /path/to/your/repo
mkdir -p .roadmap
```

Add the roadmap fragment to your CLAUDE.md (or equivalent agent-rules
file). Copy the contents of
[templates/claude-md-fragment.md](../templates/claude-md-fragment.md)
into that file. The fragment is wrapped in `<!-- roadmap:start -->` /
`<!-- roadmap:end -->` anchors so future updates can replace just that
block.

Author a spec describing the next 3-5 nodes of work. Get the JSON schema
with:

```sh
roadmap api make
```

A minimal node looks like:

```json
{
  "id": "setup-db",
  "desc": "Create PostgreSQL schema and seed table",
  "depends": ["init"],
  "produces": ["db/schema.sql"],
  "consumes": ["config/db.json"],
  "validate": [{ "type": "artifact-exists" }]
}
```

Compile the spec into a DAG and orient:

```sh
roadmap make docs/<your-project>.spec.json --note "initial DAG"
roadmap orient --note "begin"
```

## Skills

The `.claude/skills/` directory ships five skills that teach roadmap to a Claude
Code (or compatible) agent. They are the executable counterpart to this
doc: prose the agent loads on demand, not glue you wire by hand.

```
  skill              what it does
  ────────────────── ────────────────────────────────────────────────────────
  roadmap-spec       Generate specs · round-carriers discipline at HONEST-RED
  roadmap-orient     Self-orient at session start — position, fleet, next step
  roadmap-auto       Autonomous execution · convergence stance · iterate loop on RED
  roadmap-term       Assess convergence · successor with named carriers
```

This `.claude/skills/` directory is the **canonical source** of the roadmap
skills. Consuming repos should **symlink** to it rather than copy — copies
drift. See [`.claude/skills/README.md`](../.claude/skills/README.md) §"Canonical
source + symlink convention" for the exact per-skill and loop commands.

For Claude Code, install by copying (or symlinking, if you want to track
upstream):

```sh
cp -r .claude/skills/* ~/.claude/skills/
# or, to follow upstream:
for s in .claude/skills/*/; do
  ln -s "$(pwd)/$s" "$HOME/.claude/skills/$(basename "$s")"
done
```

For other agent stacks (Cursor, Aider, Continue, etc.), there is no
universal skills surface — copy the body of each `SKILL.md` into the
agent's instruction surface (Cursor rules file, Aider config, system
prompt, etc.). The `SKILL.md` files are intentionally readable and
copy-pastable: frontmatter describes when to invoke, the body is the
prompt the agent runs against.

## Why this is a doc, not a script

Earlier versions shipped `roadmap init` as a script that mutated
`CLAUDE.md` via anchored merge and copied skill files into
`~/.claude/skills/`. That worked for one environment (Claude Code on a
solo repo with pnpm) and was wrong everywhere else: it broke monorepos
that vendor agent rules per-package, it ignored Cursor/Aider users, it
fought repos with hand-curated CLAUDE.md anchor schemes, and it assumed
a writable global skills directory. An LLM agent reading this doc and
adapting to the actual repo handles those cases the script could not.

`roadmap init` is preserved as a command, but it now just prints this
document.

## Verifying

After setup, this should succeed and return a position:

```sh
roadmap orient --note "verify"
```

Expected: JSON with `ok: true` and a `data.position` array describing
the current batch. If `position` is empty and `chainReady` is true, the
DAG is at terminal — author a successor spec or close the chain.
