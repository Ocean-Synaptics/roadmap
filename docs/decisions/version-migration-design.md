# Version Migration Design

## Problem

DAG schemas evolve over time:
- Add new fields to nodes (e.g., `timeout`, `retry`)
- Change node structure (rename fields, move produces)
- Update graph metadata (add `protocolVersion`)

Existing DAGs must remain loadable even after schema changes. Migrations handle the transformation.

## Solution

Store version in `.roadmap/head.json` and apply migrations on load:

```json
{
  "id": "my-project",
  "version": "1",
  "protocolVersion": "v0.5.0",
  "init": "...",
  "term": "...",
  "nodes": { ... }
}
```

When loading: detect version, apply migrations in sequence, return upgraded DAG.

## Design

### Version Numbers

- `head.json` has `version: string` (e.g., "1", "2", "3")
- `protocolVersion: string` optional (e.g., "v0.5.0")
- Migrations are cumulative: v1 → v2 → v3

### Migration Function

```typescript
type Migration<T1, T2> = (g: T1) => T2;

const v1_to_v2: Migration<GraphV1, GraphV2> = (g) => {
  return {
    ...g,
    nodes: Object.fromEntries(
      Object.entries(g.nodes).map(([id, node]) => [
        id,
        { ...node, timeout: undefined },
      ])
    ),
  };
};
```

### Load Flow

```
1. Read .roadmap/head.json
2. Detect version field
3. Load appropriate migrations
4. Apply in sequence
5. Return current-version DAG
```

### Storage

Migrations stored in `src/migrations/`:
```
migrations/
├── 1_to_2.ts
├── 2_to_3.ts
└── 3_to_4.ts
```

Each file exports migration function.

### Guarantees

- **Non-destructive**: migrations preserve data (add fields, don't remove)
- **Backward compatible**: can load old DAGs
- **Forward prepared**: new fields have defaults
- **Idempotent**: running migration twice is safe

## Non-Goals

- Automatic schema inference (explicit migrations only)
- Rollback to older versions (migrations are one-way)
- Cross-graph migrations (per-repo only)

## Rationale

**Why versioning?**
- Track schema changes over time
- Support multi-version ecosystem
- Enable safe upgrades

**Why cumulative migrations?**
- Each migration is small and testable
- Clear audit trail of changes
- Easy to understand individual steps

**Why non-destructive?**
- Never lose data during upgrade
- Graceful forward compatibility
- Safe to add fields conservatively
