# Roadmap Protocol — CLAUDE.md Overlay

Paste into any CLAUDE.md. Layers on top of existing instructions — does not replace them. Protocol governs sequencing and state; your existing config governs style and conventions.

---

## Roadmap Protocol

Every interaction that mutates state (code, files, config, infra, docs) is roadmap-governed. Only pure reasoning (Q&A, explanation, no artifacts produced) is exempt. Planning is a task — it produces a DAG.

### CLI

The roadmap CLI lives at `~/src/roadmap/bin/roadmap`. It works from any directory.

```
~/src/roadmap/bin/roadmap orient    --note "..."   Position (or "untracked" if no local DAG)
~/src/roadmap/bin/roadmap describe  --note "..."   Full API surface + project state
~/src/roadmap/bin/roadmap validate  --note "..."   Run validation rules
~/src/roadmap/bin/roadmap parallel  --note "..."   Batched execution groups
~/src/roadmap/bin/roadmap expand    --note "..."   Run expansion script, validate, commit
~/src/roadmap/bin/roadmap branch    --note "..."   Create git branch with optional DAG
~/src/roadmap/bin/roadmap trail                    Read trail (local if DAG exists, else global)
~/src/roadmap/bin/roadmap trail --global           Cross-project trail (~/.roadmap/trail.jsonl)
~/src/roadmap/bin/roadmap trail --repo <name>      Filter by repo
~/src/roadmap/bin/roadmap trail --archive          Commit (local) or truncate (global)
~/src/roadmap/bin/roadmap help
```

All commands except help/trail require `--note "reason"`.

### Trail

Every invocation appends to `~/.roadmap/trail.jsonl` (global, cross-project). Repos with `.roadmap/head.json` also get a local trail. Each entry carries `repo`, `ts`, `cmd`, `note`, and (for orient) `position`.

### Session protocol

**Start**: `~/src/roadmap/bin/roadmap orient --note "session start — <intent>"`

- If the repo has `.roadmap/head.json`: returns DAG position, produces, remaining.
- If not: returns `position: "untracked"`. The breadcrumb still records.
- Either way, the global trail gets an entry.

**During work**: orient after completing logical units. If doing multi-step work in an untracked repo and the task warrants it, create a `.roadmap/head.json`:

```json
{
  "id": "project-name", "desc": "goal", "init": "init", "term": "term",
  "nodes": {
    "init": { "id": "init", "desc": "current state", "produces": [], "consumes": [], "deps": [], "validate": [], "idempotent": true },
    "term": { "id": "term", "desc": "goal", "produces": [], "consumes": [], "deps": ["init"], "validate": [], "idempotent": false }
  }
}
```

Expand nodes between init and term. 3 is fine for a small task. `define()` catches structural errors.

**End**: `~/src/roadmap/bin/roadmap trail --archive` if trail has entries.

### What this changes

Before: agent reads codebase, plans internally, executes, maybe writes summary.
After: agent orients, sees position, executes, records breadcrumb, advances. Sessions are continuations, not fresh starts.

The agent cannot:
- Start work without orienting
- Claim progress without the trail recording it
- Infer position from memory — orient is the source of truth

The agent gains:
- Instant reorientation (one command, not file-reading)
- Session continuity (trail + git history)
- Cross-project visibility (`trail --global`)

### Conflict resolution

Your existing CLAUDE.md governs *how* (style, tools, conventions). The protocol governs *what* and *when* (sequencing, state, ordering). They compose:

| Yours says | Protocol says | Resolution |
|------------|--------------|------------|
| "Use pytest" | "Node X produces tests/" | Write tests with pytest. Node X tracks it. |
| "Run lint before commit" | "Orient after node completion" | Lint, then orient. Both happen. |
| "Don't modify without asking" | "Task is roadmap-governed" | Ask first, but DAG tracks what's planned. |
| "Use feature branches" | `roadmap branch <name>` | Roadmap creates the git branch. |

Sequencing/state conflicts → protocol wins. Style/convention conflicts → yours win.
