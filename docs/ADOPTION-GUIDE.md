# Adoption Guide: Getting Started with Roadmap

This guide walks through integrating roadmap into your project with a single command.

## Prerequisites

- Node.js 18+ with npm/pnpm/yarn
- Your project's `package.json` exists
- A build command (npm run build, tsc, vite build, etc.)

## Step 1: Create .roadmap.json

Roadmap needs minimal metadata about your project:

```bash
cat > .roadmap.json << 'EOF'
{
  "projectType": "typescript-library",
  "init": [
    "package.json",
    "src/index.ts",
    "tsconfig.json"
  ],
  "term": [
    "dist/index.js",
    "dist/index.d.ts"
  ],
  "buildCommand": "tsc"
}
EOF
```

**What each field means:**
- `projectType`: What kind of project (freeform string, e.g., "typescript-library", "react-app", "cli-tool")
- `init`: Files that exist now (your current source)
- `term`: Files that should exist when done (your build artifacts)
- `buildCommand`: How to build (e.g., "npm run build", "tsc", "vite build")

**Tips:**
- `init` should be the minimal files needed to start building
- `term` should be the artifacts your project produces
- `buildCommand` can be anything — it's just documentation in the generated roadmap

## Step 2: Install Roadmap

```bash
npm install ../roadmap
# or: pnpm add ../roadmap
# or: yarn add ../roadmap
```

(Replace `../roadmap` with the path to the roadmap package in your setup)

## Step 3: Generate Your Roadmap

```bash
node node_modules/roadmap/bin/roadmap-integrate.ts --dry-run
```

This previews the generated `roadmap.ts` without writing anything.

Output:
```typescript
#!/usr/bin/env node
/**
 * Project roadmap
 * ...
 */
export default define(graph({
  id: 'typescript-library',
  desc: 'Project roadmap for typescript-library',
  init: 'init',
  term: 'term',
  nodes: {
    init: { ... },
    build: { ... },
    term: { ... },
  },
}));
```

## Step 4: Generate and Commit

Once you're happy with the preview:

```bash
node node_modules/roadmap/bin/roadmap-integrate.ts
```

This writes:
- `roadmap.ts` — your project DAG
- `.roadmap/head.json` — metadata (for tooling)

Then commit:

```bash
git add roadmap.ts .roadmap/
git commit -m "feat: roadmap — project governance"
```

## Step 5: Check Your Position

```bash
node roadmap.ts --position
```

Output:
```json
{
  "position": "build",
  "produces": ["dist/index.js", "dist/index.d.ts"],
  "consumes": ["src/index.ts", "package.json", "tsconfig.json"],
  "remaining": 1,
  "complete": false
}
```

**What this means:**
- You're currently at the `build` phase
- To advance, create: `dist/index.js`, `dist/index.d.ts`
- You can use: `src/index.ts`, `package.json`, `tsconfig.json`

## Step 6: Execute

Use your build command:

```bash
npm run build
# or: tsc
# or: vite build
```

Then check position again:

```bash
node roadmap.ts --position
# → position: "term", remaining: 0, complete: true
```

## CLI Reference

### Basic usage

```bash
node bin/roadmap-integrate.ts [options]
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--dry-run` | Preview without writing | `--dry-run` |
| `--force` | Overwrite existing `roadmap.ts` | `--force` |
| `--output DIR` | Output directory (default: cwd) | `--output /path` |
| `--help` | Show help | `--help` |

### Examples

```bash
# Preview generated roadmap
node bin/roadmap-integrate.ts --dry-run

# Generate and write
node bin/roadmap-integrate.ts

# Regenerate (overwrite existing)
node bin/roadmap-integrate.ts --force

# Write to specific directory
node bin/roadmap-integrate.ts --output /tmp/my-project
```

## What Gets Generated?

The CLI generates a minimal 3-node DAG:

```
init (setup) → build (compile) → term (ready)
```

**Each node:**

| Node | Purpose | Produces | Idempotent |
|------|---------|----------|-----------|
| `init` | Install dependencies | `node_modules`, `package.json` | ✓ Yes |
| `build` | Compile/bundle | Your build artifacts | ✓ Yes |
| `term` | Done gate | (none) | ✗ No (deployment gate) |

All nodes are **idempotent** except `term` — meaning agents can safely re-run them if interrupted.

## Extending Your Roadmap

Once you have the minimal DAG, you can add custom phases:

```typescript
// Add a test phase between build and term
const gap = reconcile(roadmap, [], ['dist/index.js']); // what's missing?
// → identify you need test-results.json
// Add test node, re-run verify()
```

Or use `merge()` to combine with a shared DAG:

```typescript
import roadmap from './roadmap.ts';
import companyStandard from '../standards/roadmap.ts';

const merged = merge(roadmap, companyStandard, [
  { from: 'build', to: 'lint', artifact: 'dist' },
]);
```

See `docs/decisions/branch-design.md` for advanced patterns.

## Troubleshooting

### "No .roadmap.json found"

Create `.roadmap.json` first (see Step 1)

### "Generated DAG contract violations"

This means `build` is trying to consume files that `init` doesn't produce. Fix `.roadmap.json`:

```json
{
  "init": ["package.json", "src/index.ts", "tsconfig.json"],  // ADD tsconfig.json here
  "term": ["dist/index.js"]
}
```

### "roadmap.ts already exists"

Use `--force` to overwrite:

```bash
node bin/roadmap-integrate.ts --force
```

### Build command not auto-detected

Provide `buildCommand` in `.roadmap.json`:

```json
{
  "buildCommand": "npm run build"  // Explicit command
}
```

## Real Examples

### TypeScript Library

```json
{
  "projectType": "typescript-library",
  "init": ["package.json", "src", "tsconfig.json"],
  "term": ["dist", "*.d.ts"],
  "buildCommand": "tsc"
}
```

### React Web App

```json
{
  "projectType": "webapp-react",
  "init": ["package.json", "src", "public/index.html"],
  "term": ["dist"],
  "buildCommand": "npm run build"
}
```

### Monorepo

```json
{
  "projectType": "monorepo",
  "init": ["package.json", "packages/*/package.json"],
  "term": ["packages/*/dist"],
  "buildCommand": "npm run build --workspaces"
}
```

## Next Steps

1. **Commit your roadmap**: `git add roadmap.ts .roadmap/ && git commit`
2. **Track progress**: Run `node roadmap.ts --position` regularly to see status
3. **Add phases**: Use `reconcile()` to identify gaps and add test/lint/deploy phases
4. **Automate**: Create an agent that runs `node roadmap.ts --position` → executes → commits

## API Reference

Import directly:

```typescript
import { orient, verify, define, check, order } from 'roadmap/protocol';
import roadmap from './roadmap.ts';

// Check current position
const pos = orient(roadmap, (artifact) => existsSync(artifact));

// Verify contracts are satisfied
const errors = verify(roadmap);
if (errors.length) console.error('Contracts violated:', errors);

// Get execution order
const phases = order(roadmap);
// → ['init', 'build', 'term']
```

See `README.md` for full API documentation.

## Support

- **Questions?** Read `docs/decisions/` for design decisions
- **Contributing?** See `SKILL.md` for the expansion protocol
- **Issues?** File on GitHub

## License

Same as the roadmap package
