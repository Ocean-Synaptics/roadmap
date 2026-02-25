# Roadmap Protocol — Installation

## Quick install

From any repo:

```bash
/path/to/roadmap/bin/roadmap install
```

This splices the protocol into `.claude/CLAUDE.md` (or creates it). Paths are resolved automatically. Re-running updates in place.

To install into a specific file:

```bash
/path/to/roadmap/bin/roadmap install ~/.claude/CLAUDE.md
/path/to/roadmap/bin/roadmap install /path/to/project/.claude/CLAUDE.md
```

## What it installs

A `<!-- ROADMAP-PROTOCOL-START -->` / `<!-- ROADMAP-PROTOCOL-END -->` block containing:

- **Session protocol**: orient on start, chart after orient, archive on end
- **Chart directive**: agents must reprint chart output verbatim — no summarizing
- **Trail behavior**: global + local dual-write, `--repo` filtering
- **DAG bootstrap**: instructions for creating `.roadmap/head.json` in untracked repos

All paths in the installed block are absolute, resolved at install time.

## Conflict resolution

The installed block layers on top of existing instructions. It does not replace anything outside the anchor comments. Your existing CLAUDE.md governs style and conventions; the protocol governs sequencing and state.

Re-running `roadmap install` on the same file updates the block without touching surrounding content.

## Chart

```bash
roadmap chart
```

Prints emoji progress bars, per-batch breakdown, current position. The installed CLAUDE.md tells agents to reprint this verbatim after every orient so the user always sees progress.
