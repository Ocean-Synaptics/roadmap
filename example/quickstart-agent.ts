#!/usr/bin/env node
/**
 * Quickstart agent: minimal autonomous executor with checkpoint + audit
 *
 * Usage: npx ts-node example/quickstart-agent.ts
 */

import { loadDAG, orient } from '../src/protocol.ts';
import { CheckpointManager } from '../src/checkpoint.ts';
import { AuditTrail } from '../src/audit.ts';
import { ConsumerBootstrapDAG } from './consumer-bootstrap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

async function main() {
  console.log('=== QUICKSTART AGENT ===\n');

  // Load + validate
  const dag = await loadDAG(ConsumerBootstrapDAG);
  console.log(`DAG: ${dag.id} (${Object.keys(dag.nodes).length} nodes)`);

  // Initialize
  const checkpoint = new CheckpointManager(repoRoot);
  const audit = new AuditTrail(repoRoot);

  // Start audit session
  audit.startSession('quickstart-agent');

  // Try restore from checkpoint
  let position;
  const restore = await checkpoint.restore();

  if (restore) {
    console.log(`✓ Restored from checkpoint: ${restore.checkpoint.id}`);
    console.log(`  Position: ${restore.position}`);
    position = restore.position;
  } else {
    // Fresh orientation
    const fsCheck = (a: string) => existsSync(join(repoRoot, a));
    const orientation = orient(dag, fsCheck);

    position = orientation.position;
    console.log(`✓ Fresh orientation: ${position}`);
    console.log(`  Produces: ${orientation.produces.join(', ')}`);
    console.log(`  Consumes: ${orientation.consumes.join(', ')}`);
  }

  console.log(`\nRemaining: ${Object.keys(dag.nodes).length - 1} nodes\n`);

  // Main loop
  let nodeCount = 0;
  const maxNodes = 5; // Safety: don't loop forever in demo

  while (position !== dag.term && nodeCount < maxNodes) {
    const node = dag.nodes[position];
    const nodeStart = Date.now();

    console.log(`\n📍 [${++nodeCount}] ${position}`);
    console.log(`   ${node.desc}`);
    console.log(`   Produces: ${node.produces.join(', ')}`);

    // Simulate artifact creation (for demo)
    console.log(`   Action: simulate artifact creation`);

    // Validate (all artifacts exist for demo)
    console.log(`   ✓ Validation passed`);

    // Record in audit
    audit.record({
      nodeId: position,
      status: 'complete',
      duration: Date.now() - nodeStart,
      artifacts: node.produces.map(p => ({
        path: p,
        hash: 'sha256:demo',
      })),
      validation: { type: 'artifact-exists', passed: true },
    });

    // Save checkpoint
    await checkpoint.saveCheckpoint({
      position,
      phase: position,
      artifacts: node.produces,
      agent: 'quickstart-agent',
      duration: Date.now() - nodeStart,
      success: true,
    });

    // Advance
    const fsCheck = () => true; // All exist in demo
    const nextPos = orient(dag, fsCheck);
    position = nextPos.position;
  }

  // End session
  await audit.endSession();

  console.log(`\n✓ Agent session complete`);
  console.log(`  Nodes executed: ${nodeCount}`);
  console.log(`  Final position: ${position}`);
  console.log(`  Audit: AUDIT.md (append-only)`);
  console.log(`  Checkpoints: .roadmap/checkpoints/`);
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
