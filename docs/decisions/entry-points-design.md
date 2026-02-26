# Entry Points Design

## Problem

Current structure exports everything from main `roadmap` entry point:

```typescript
import { define, verify, orient, ... } from 'roadmap';
import { CheckpointManager, ... } from 'roadmap/recovery';
import { fileExists, ... } from 'roadmap/predicates';
```

This works but:
- **Bloats node_modules size** — users importing only `orient` get checkpoint, audit, versioning code
- **Unclear dependency order** — protocol users don't know about recovery
- **Coupling** — API surface appears monolithic

## Solution: Sub-Entry-Points

Organize imports by use case:

```typescript
// Core protocol — always needed
import { define, verify, orient, check, order } from 'roadmap/protocol';

// Recovery and checkpoints — optional
import { CheckpointManager, restore } from 'roadmap/recovery';

// Predicates for session control
import { fileExists, siblingArtifactExists } from 'roadmap/predicates';

// Validation (usually at build time)
import { validateNode, validateGraph } from 'roadmap/validation';

// Versioning utilities
import { loadDAG, migrate } from 'roadmap/versioning';

// Agent sealed API — no direct protocol access
import { getBrief, advance } from 'roadmap/agent';

// Full API (backward compatible)
import { define, verify, orient, /* everything */ } from 'roadmap';
```

## Package Exports (package.json)

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./protocol": {
      "types": "./dist/protocol.d.ts",
      "default": "./dist/protocol.js"
    },
    "./recovery": {
      "types": "./dist/recovery.d.ts",
      "default": "./dist/recovery.js"
    },
    "./predicates": {
      "types": "./dist/predicates.d.ts",
      "default": "./dist/predicates.js"
    },
    "./validation": {
      "types": "./dist/validation.d.ts",
      "default": "./dist/validation.js"
    },
    "./versioning": {
      "types": "./dist/versioning.d.ts",
      "default": "./dist/versioning.js"
    },
    "./agent": {
      "types": "./dist/agent.d.ts",
      "default": "./dist/agent.js"
    }
  }
}
```

## Module Layering

```
┌─────────────────────────┐
│  Main Entry (roadmap)   │  Full API, backward compat
├─────────────────────────┤
│  Agent (sealed)         │  No DAG introspection
├─────────────────────────┤
│  Protocol               │  Core DAG operations
│  Recovery               │  Checkpoint/restore
│  Predicates             │  Artifact detection
│  Validation             │  Type/contract checking
│  Versioning             │  Migration helpers
└─────────────────────────┘
```

## Build Steps

1. **Compile TypeScript** — tsc outputs dist/protocol.js, dist/recovery.js, etc.
2. **Generate type stubs** — index.d.ts, protocol.d.ts, etc.
3. **Update package.json exports** — map paths to files
4. **Test imports** — verify sub-entry-points work

## Benefits

- ✅ **Tree-shakeable** — bundlers can drop unused modules
- ✅ **Clear contracts** — each entry point documents its scope
- ✅ **Explicit dependencies** — import what you need
- ✅ **Future-proof** — new modules don't bloat existing imports
- ✅ **Backward compatible** — main `roadmap` still works

## Next

- Phase 10: Implement API refactoring and update package.json
- Phase 11: Migrate CLI and tests to sub-entry-points
- Phase 12: Deprecation notice for old imports (optional)

## Related

- `package.json` — entry point definitions
- `tsconfig.json` — compile targets
- `src/index.ts` — main re-export file
- `src/protocol.ts`, `src/recovery.ts`, etc. — module entry points
