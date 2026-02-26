# Roadmap Library Consumer Guide

The roadmap library supports six consumer categories. Choose the entry point that fits your use case:

## 1. Hook Integrator (`roadmap/hooks`)

**Use case**: Git hooks, post-commit automation, CI pipeline integration.

```ts
import { repoInfo, isClean, stageAndCommit } from 'roadmap/hooks';
const info = repoInfo(process.cwd());
console.log(`Branch: ${info.branch}, Clean: ${info.clean}`);
```

**Tools**: `repoInfo`, `stageAndCommit`, `isClean`, `trackedFiles`, `fileHistory`, `restore`

---

## 2. Skills Integrator (`roadmap`)

**Use case**: Regent skills, other agent frameworks.

Use the standard `roadmap` import (default full API).

```ts
import { orient, fileExists } from 'roadmap';
```

---

## 3. CLAUDE.md Integrator

**Use case**: Project instructions, session protocols.

Edit `.claude/CLAUDE.md` directly with roadmap protocol sections. No API needed — it's documentation-first.

```markdown
## Roadmap Protocol
Every interaction that mutates state is roadmap-governed.

- `roadmap orient --note "<intent>"` at session start
- `roadmap chart` to see progress
```

---

## 4. Agent User (`roadmap/agent`)

**Use case**: Sealed agent executor, no DAG introspection.

```ts
import { getBrief, advance, checkpoint } from 'roadmap/agent';
const brief = await getBrief('my-node');
console.log(brief.desc, brief.produces);
```

**Sealed API**: `getBrief`, `advance`, `checkpoint`, `verifyBootstrapSignature`

---

## 5. Roadmap.ts Developer (`roadmap/developer`)

**Use case**: Define DAGs in TypeScript.

```ts
import { define, graph, orient, fileExists, compound } from 'roadmap/developer';

const g = define(graph({
  id: 'my-project',
  init: 'start',
  term: 'done',
  nodes: {
    start: { id: 'start', produces: ['a.ts'], consumes: [], deps: [], validate: [], idempotent: true },
    done: { id: 'done', produces: [], consumes: ['a.ts'], deps: ['start'], validate: [], idempotent: false },
  },
}));

const pos = orient(g, fileExists(process.cwd()));
console.log(`Position: ${pos.position}`);
```

---

## 6. Full Consumer (`roadmap`)

**Use case**: Everything — cross-repo, recovery, versioning, git operations.

```ts
import { define, crossOrient, stageAndCommit, CheckpointManager } from 'roadmap';
```

---

## Choosing Your Entry Point

| Scenario | Entry Point | API Size |
|----------|------------|----------|
| Hook: post-commit state query | `roadmap/hooks` | 12 functions |
| Agent: execution + briefing | `roadmap/agent` | 4 functions |
| Developer: DAG + orient | `roadmap/developer` | 40+ types/functions |
| Full: everything | `roadmap` | 70+ exports |
| Docs: session protocol | CLAUDE.md | N/A |

---

## API Consistency

All entry points:
- Use **typed exports** — no guessing what's available
- Follow **consistent naming** — `repoInfo`, `orient`, `validate` across all categories
- Provide **composable predicates** — build custom orient checks with `compound`, `any`
- Include **error types** — `RoadmapError` with fix suggestions

---

## Cross-Repo Work

Use `roadmap/developer` + `crossOrient`:

```ts
import { crossOrient } from 'roadmap';
const result = await crossOrient(dag, repoRoot);
console.log(result.blockedBy);  // Deps blocking this repo
```
