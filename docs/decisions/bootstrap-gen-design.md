# Bootstrap Generation Design

## Problem

New projects need to:
1. Copy roadmap into their repo
2. Create initial roadmap.ts (DAG definition)
3. Set up bootstrap harness to execute tasks
4. Integrate roadmap into their build/dev workflow

Current solution: manual copy-paste + boilerplate. Repetitive, error-prone.

## Solution

Provide command and templates:
```bash
roadmap bootstrap --target ../new-project --init-template "monorepo" --notes "..."
```

Generates:
- `roadmap.ts` skeleton (init → term, empty nodes)
- `.roadmap/head.json` (pre-initialized DAG)
- `bin/roadmap` wrapper (convenience CLI)
- `.roadmap.json` metadata (package refs, dep info)
- `BOOTSTRAP.md` onboarding guide

## Design

### bootstrap-gen-spec Output

`docs/decisions/bootstrap-gen-design.md` (this file)

Defines:
- Template system (init/monorepo/multi-repo variants)
- Code generation rules (import paths, tsconfig refs)
- Validation before write (no overwrites, no merge conflicts)
- Integration with existing roadmap consumer patterns

### Templates

**init**: Single-repo, simple project
```typescript
const g = graph({
  id: 'my-project',
  init: 'scaffold',
  term: 'done',
  nodes: { /* your nodes here */ }
});
```

**monorepo**: Multi-package, shared build
```typescript
const g = graph({
  id: 'my-monorepo',
  init: 'setup',
  term: 'shipped',
  nodes: {
    setup: { ... },
    packages: { produces: ['packages/*'] },
    tests: { consumes: ['packages/*'] },
    shipped: { ... }
  }
});
```

**multi-repo**: Cross-repo coordination (via cross-orient)
```typescript
const g = graph({
  id: 'my-workspace',
  init: 'check-deps',
  term: 'deployed',
  nodes: {
    'check-deps': { validate: [blockWith('packages/*/roadmap.ts')] }
    // nodes consumes: siblingArtifactExists(root, '../sibling')
  }
});
```

### Generation Flow

1. **Parse input**: `--target`, `--template`, `--notes`
2. **Validate target**: directory exists, writeable, no conflicts
3. **Read templates**: from `src/templates/` or embedded
4. **Substitute vars**: `{{PROJECT_NAME}}`, `{{INIT_NODE}}`, `{{TERM_NODE}}`
5. **Write files**: roadmap.ts, .roadmap/head.json, bin/roadmap, BOOTSTRAP.md
6. **Suggest next steps**: "Run `roadmap chart` to view your DAG"

### Validation Rules

- `roadmap.ts` must parse + execute
- `head.json` must pass `define(g)` checks
- All produced files must exist (post-generation)
- No overwrite without explicit `--force`

### Integration Points

- CLI: `bin/roadmap.ts bootstrap` command
- Templates: read from `src/templates/` directory
- Consumer patterns: cockpit, fusion (as reference examples)

## Non-Goals

- Auto-detect project structure (user specifies template)
- Generate full working DAG (just skeleton + docs)
- Manage package.json updates (user responsibility)
- Create git commits (session trail handles breadcrumbs)

## Rationale

**Why templates?**
- Projects vary (monorepo vs multi-repo vs single)
- Each has different artifact/dependency patterns
- Templates capture best practices without forcing one size

**Why generate head.json?**
- Faster than writing DAG by hand
- Allows roadmap orient/chart to work immediately
- Enables incremental expansion (user fills in nodes)

**Why bin/roadmap wrapper?**
- Convenience: `./bin/roadmap chart` instead of `npx ts-node ...`
- Familiar convention (same as existing repos)
- Works in monorepos (single entry point)

**Why validation?**
- Catch errors early (invalid DAG won't execute)
- Prevent accidental overwrites (explicit --force)
- Fail fast so user can fix and re-run
