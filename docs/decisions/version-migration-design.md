# Versioning: DAG version + protocol compatibility

## Problem

Roadmap protocol evolves. Consumers have older DAGs.
- v0.1.0: no idempotent field
- v0.2.0: idempotent optional
- v0.3.0: idempotent required

Without versioning: silent failures or forced rewrites.
With versioning: explicit migrations, predictable upgrades.

## Solution: Version field + compatibility layer

### DAG structure (v0.3.0+)

```typescript
interface Graph<T> {
  readonly id: string;
  readonly desc: string;
  readonly version: string;              // DAG version (semver): "1.0.0"
  readonly protocolVersion: string;      // Protocol version (semver): "0.3.0"
  readonly init: string;
  readonly term: string;
  readonly nodes: Record<T, NodeSpec<T>>;
}
```

### Protocol versions

| Version | Breaking Changes | Migrations |
|---------|------------------|-----------|
| 0.1.0 | Initial | — |
| 0.2.0 | Added `idempotent?` (optional) | None (backward compat) |
| 0.3.0 | **BREAKING**: `idempotent: boolean` (required) | Fill missing: infer from node type |
| 0.4.0+ | Future | — |

### Compatibility matrix

| DAG v | Protocol v | Load as | Migration |
|-------|-----------|---------|-----------|
| any | 0.1.0 | 0.1.0 | none |
| any | 0.2.0 | 0.2.0 | none (optional field) |
| ≤0.2.0 | 0.3.0 | 0.3.0 | fill idempotent |
| 0.3.0+ | 0.3.0 | 0.3.0 | none |
| 0.3.0+ | 0.1.0 | ERROR | downgrade not supported |

## Versioning API

### Check compatibility

```typescript
function checkCompatibility(
  dagProtocolVersion: string,
  currentProtocolVersion: string = '0.3.0'
): {
  compatible: boolean;
  required?: string;       // version needed
  needsMigration?: boolean;
  migrations?: string[];   // migration chain
  message?: string;
}
```

### Migrate DAG

```typescript
function migrateDAG(
  dag: Graph,
  targetVersion: string
): Graph
```

Example:
```typescript
const old = readJson('roadmap.ts'); // protocolVersion: "0.1.0"
const compat = checkCompatibility(old.protocolVersion);
// compat.compatible = false
// compat.required = "0.2.0 or higher"

const migrated = migrateDAG(old, '0.3.0');
// Applied: 0.1→0.2 (add idempotent:Optional)
//          0.2→0.3 (fill idempotent:Required)
```

## Migration strategies

### 0.1.0 → 0.2.0 (optional idempotent)
```typescript
// Add idempotent?: undefined (no-op, backward compat)
nodes[id].idempotent = undefined;
```

### 0.2.0 → 0.3.0 (required idempotent)
```typescript
// Infer from node semantics
for (const node of nodes) {
  if (!('idempotent' in node)) {
    // Heuristic: if node has deps + produces → likely code/test → true
    if (node.deps.length > 0 || node.produces.length > 0) {
      node.idempotent = true;
    } else if (node.validate?.some(v => v.type === 'manual-approval')) {
      node.idempotent = false;
    } else {
      node.idempotent = true; // default to true (safe)
    }
  }
}
```

## Load sequence

```typescript
function loadDAG(path: string): Graph {
  // 1. Read + parse
  const raw = readJson(path);

  // 2. Check compatibility
  const compat = checkCompatibility(raw.protocolVersion);
  if (!compat.compatible) {
    console.error(`DAG v${raw.protocolVersion} not compatible`);
    console.error(`Need: ${compat.required}`);
    process.exit(1);
  }

  // 3. Migrate if needed
  let dag = raw;
  if (compat.needsMigration) {
    console.log(`Migrating DAG: ${compat.migrations?.join(' → ')}`);
    dag = migrateDAG(raw, currentVersion);
  }

  // 4. Validate + return
  define(dag); // tsc + define() checks
  return dag;
}
```

## Testing strategy

Adversarial tests (migrations.test.ts):

| Scenario | Test | Expectation |
|----------|------|------------|
| Load 0.1.0 with 0.3.0 protocol | checkCompatibility() | compatible=false, required="0.2.0+" |
| Migrate 0.1.0 → 0.3.0 | migrateDAG() | adds idempotent field to all nodes |
| Validate migrated DAG | define() + verify() | passes |
| Load current DAG | loadDAG() | no migration needed |
| Attempt downgrade | load 0.3.0 as 0.1.0 | error (not supported) |

## Deployment

### For consumers

Before:
```typescript
import roadmap from './roadmap.ts'; // might have old schema
const dag = define(roadmap);        // silent tsc error if incompatible
```

After:
```typescript
import roadmap from './roadmap.ts';
const dag = await loadDAG('.'); // explicit error + migration hint
// Output: "DAG v0.2.0 needs protocol v0.3.0. Run: npx roadmap migrate"
```

### Migration script

```bash
$ npx roadmap migrate
✓ Detected roadmap.ts (protocolVersion: 0.2.0)
✓ Migrating to v0.3.0...
  - Adding idempotent field (inferred from semantics)
  - 47 nodes updated
✓ Validated. Written to .roadmap/migrated.json
✓ Backup saved: .roadmap/roadmap.0.2.0.json
✓ Ready to commit
```

## Future: semantic versioning

Extend protocol version to encode breaking changes:
- `0.3.0`: breaking (idempotent required)
- `0.3.1`: feature (new validation rule)
- `0.4.0`: breaking (remove validate field)

Compatibility rules:
- `major` change: must migrate
- `minor` change: backward compatible
- `patch` change: no changes to schema

## Next: implement versioning

See version-migrations node for code.
