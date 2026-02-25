# Quickstart: 5-minute roadmap setup

## Step 1: Install

```bash
cd your-project
npm install ../roadmap  # or: pnpm add ../roadmap
```

## Step 2: Generate roadmap

```bash
npx roadmap generate-bootstrap \
  --project my-app \
  --desc "My TypeScript app" \
  --init src/index.ts,package.json,tsconfig.json \
  --term dist/index.js,dist/index.d.ts
```

Output:
- `roadmap.ts` — your DAG
- `boot.ts` — entry point
- `.roadmap/head.json` — metadata

## Step 3: Commit

```bash
git add roadmap.ts boot.ts .roadmap/
git commit -m "feat: roadmap — project phase tracking"
```

## Step 4: Check status

```bash
node boot.ts
# Position: build
# Produces: dist/index.js, dist/index.d.ts
# Consumes: src/index.ts, package.json, tsconfig.json
# Remaining: 1 nodes
```

## Step 5: Execute

Create a simple agent:

```typescript
import { loadDAG, orient } from 'roadmap/protocol';
import { CheckpointManager } from 'roadmap/protocol';
import { AuditTrail } from 'roadmap/protocol';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const checkpoint = new CheckpointManager(repoRoot);
const audit = new AuditTrail(repoRoot);

async function run() {
  // Load + validate
  const dag = await loadDAG(roadmap);

  // Start audit
  audit.startSession('quickstart-agent');

  // Try restore first
  let pos;
  const restore = await checkpoint.restore();
  if (restore) {
    console.log(`✓ Restored from ${restore.checkpoint.id}`);
    pos = restore.position;
  } else {
    // Fresh orientation
    const fsCheck = (a) => existsSync(join(repoRoot, a));
    const orientation = orient(dag, fsCheck);
    pos = orientation.position;
    console.log(`Current position: ${pos}`);
  }

  // Main loop
  while (pos !== dag.term) {
    const node = dag.nodes[pos];
    console.log(`\n📍 ${pos}: ${node.desc}`);
    console.log(`   Create: ${node.produces.join(', ')}`);

    // Execute node (depends on phase)
    if (pos === 'build') {
      console.log('   Running: tsc + test');
      execSync('npm run build', { stdio: 'inherit' });
    }

    // Validate
    console.log('   Validating...');
    let valid = true;
    for (const artifact of node.produces) {
      if (!existsSync(artifact)) {
        console.log(`   ✗ Missing: ${artifact}`);
        valid = false;
      }
    }

    if (!valid) {
      console.error('Validation failed');
      process.exit(1);
    }

    // Commit
    console.log('   Committing...');
    execSync(`git add -A && git commit -m "feat: ${pos}" || true`, {
      stdio: 'ignore',
    });

    // Checkpoint
    await checkpoint.saveCheckpoint({
      position: pos,
      phase: pos,
      artifacts: node.produces,
      agent: 'quickstart-agent',
      duration: 1000,
      success: true,
    });

    // Audit
    audit.record({
      nodeId: pos,
      status: 'complete',
      duration: 1000,
      artifacts: node.produces.map(p => ({ path: p, hash: 'sha256:abc' })),
    });

    // Advance
    const fsCheck = (a) => existsSync(join(repoRoot, a));
    const nextPos = orient(dag, fsCheck);
    pos = nextPos.position;
  }

  console.log('\n✓ Roadmap complete!');
  await audit.endSession();
}

run().catch(console.error);
```

Run it:
```bash
node agent.ts
```

## Step 6: Check audit

```bash
cat AUDIT.md
# Shows: agent, phases completed, timestamps, artifacts

ls -la .roadmap/checkpoints/
# All saved state for recovery
```

## Next

- Read `README.md` for full API
- Check `docs/decisions/` for design
- Multi-repo? See `example/multi-repo-merge.ts`
- Real project? Apply to cockpit or fusion
