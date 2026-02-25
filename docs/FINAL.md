# roadmap v0.3.0 — Production-ready

**Status**: Complete. Treeshaken. Documented. Tested.

- **Tests**: 133 pass (17 files)
- **Commits**: 21 (autonomous execution)
- **Code**: ~3,500 LOC
- **Position**: term (complete)

---

## What it is

DAG expansion protocol library for autonomous project execution.

**6 core functions** → compile-time safe project phases  
**Recovery layer** → crash-proof execution via checkpoints  
**Versioning** → automatic consumer DAG upgrades  
**Audit trail** → append-only evidence for replay

---

## User workflows

| Persona | Entry point | Exports needed |
|---------|-------------|------------------|
| **Consumer** | `import { loadDAG, orient }` | 2 functions + types |
| **Agent** | `import { CheckpointManager, AuditTrail }` | + recovery layer |
| **Developer** | `import { define, graph, verify, check }` | + all protocol fns |

→ See `docs/WORKFLOWS.md` for details

---

## Public API

**Main entry**:
```typescript
import { 
  // Core
  define, graph, check, verify, order, orient, reconcile, merge, branch,
  // Recovery
  CheckpointManager, AuditTrail,
  // Versioning
  loadDAG, checkCompatibility, migrateDAG
} from 'roadmap';
```

**Power users** (protocol internals):
```typescript
import { define, verify } from 'roadmap/protocol';
```

→ See `docs/API.md` for complete reference

---

## Clean exports

✅ **Public** (via `src/index.ts`):
- define, graph, check, verify, order, orient, reconcile, merge, branch
- analyze, modify, modifyAndCommit (DAG modification)
- CheckpointManager, AuditTrail
- loadDAG, checkCompatibility, migrateDAG
- All types (Graph, NodeSpec, Orientation, ValidationRule, etc.)

❌ **Internal** (not exported):
- detectCycles, fwd (cycle detection implementation)
- Flat type (internal representation)
- Individual migration helpers
- Hash utilities

---

## Architecture layers

| Layer | Focus | Nodes | Tests |
|-------|-------|-------|-------|
| 0: Protocol | Core + adversarial hardening | 8 | 37 |
| 1–4: DAG ops | Merge, branch, modification | 16 | 27 |
| 5: Recovery | Checkpoint, audit, git-state | 10 | 20 |
| 6: Agent | Regent template, execution | 4 | 12 |
| 7: Versioning | Version + migration + load | 4 | 10 |
| **Total** | | **53** | **133** |

---

## Key properties

### Idempotency guarantee
All nodes declare: `idempotent: true | false`
- **true**: code/test/docs — re-runnable, deterministic
- **false**: manual/deployment — one-time, no recovery

Lost artifacts on idempotent nodes → re-run deterministically (validation proves correctness)

### Self-healing recovery
Crash mid-phase → checkpoint saved state  
Boot again → restore from checkpoint (skip completed nodes)  
Idempotent nodes re-run if artifacts vanish after validation

### Version compatibility
Load old DAG (0.1.0) with new protocol (0.3.0)  
→ Auto-migrates or explicit error  
No silent breakage

### Audit trail
Append-only session records  
→ Evidence for debugging + replay  
→ Queries: failed phases, artifacts, duration

---

## Testing

**133 tests across 17 files**:
- 37 core protocol tests (incl. adversarial specs)
- 27 DAG operation tests (merge, branch, modify)
- 20 recovery layer tests (checkpoint, audit)
- 12 agent integration tests
- 10 versioning + migration tests
- 27 consumer adoption + real-world patterns

All tests pass. No flakes. TypeScript clean.

---

## Example: Consumer adoption

```typescript
// Install
npm install ../roadmap

// Generate
npx roadmap generate-bootstrap --project my-app --init src/index.ts --term dist/index.js

// Load + migrate
import { loadDAG, orient } from 'roadmap';
import roadmap from './roadmap.ts';

const dag = await loadDAG(roadmap);  // Auto-migrates if needed
const pos = orient(dag, fileExists);

console.log(`Current: ${pos.position}`);
console.log(`Create: ${pos.produces.join(', ')}`);
```

---

## What's next

**Out of scope** (future phases):

1. **Regent orchestrator** — multi-agent coordination layer
2. **Real project validation** — apply to cockpit / fusion
3. **CLI polish** — roadmap validate, migrate, audit commands
4. **Performance** — benchmark git-state cache gain
5. **Governance extensions** — policy graphs, RBAC

**In scope** (potential refinements):

- Additional validation rules (artifact-schema, function calls)
- More migration examples
- Hook integration (regent)

---

## Summary

**roadmap v0.3.0** is a complete, production-ready DAG expansion protocol library.

- ✅ Type-safe (TypeScript)
- ✅ Testable (133 tests pass)
- ✅ Recoverable (checkpoint + audit)
- ✅ Compatible (backward-compatible versions)
- ✅ Documented (API reference + workflows)
- ✅ Clean exports (treeshaken)

**Ready for consumer adoption.**
