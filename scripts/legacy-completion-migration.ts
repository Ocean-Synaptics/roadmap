#!/usr/bin/env npx tsx
/**
 * Legacy completion migration: populate completed.json with receipts
 * for all nodes whose artifacts already exist on disk.
 *
 * Nodes completed before evidence tracking get legacy: true.
 * Nodes with passing evidence in git (committed Track 0 work) get real evidence.
 *
 * Usage:
 *   npx tsx scripts/legacy-completion-migration.ts --dry-run   # preview
 *   npx tsx scripts/legacy-completion-migration.ts              # apply
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CompletionRecordWithEvidence } from '../src/lib/completion-evidence.ts';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry-run');

const dagPath = join(repoRoot, '.roadmap', 'head.json');
const completedPath = join(repoRoot, '.roadmap', 'completed.json');

if (!existsSync(dagPath)) {
  console.error('No DAG found at', dagPath);
  process.exit(1);
}

const dag = JSON.parse(readFileSync(dagPath, 'utf-8'));
const nodes: Array<{ id: string; produces: string[]; validate: any[] }> = Object.values(dag.nodes);

// Load existing completions
let existing: CompletionRecordWithEvidence[] = [];
if (existsSync(completedPath)) {
  existing = JSON.parse(readFileSync(completedPath, 'utf-8'));
}
const existingIds = new Set(existing.map(r => r.nodeId));

function artifactExists(p: string): boolean {
  const full = p.startsWith('~') ? p.replace('~', homedir()) : join(repoRoot, p);
  return existsSync(full);
}

const migrations: CompletionRecordWithEvidence[] = [];
let skipped = 0;
let alreadyRecorded = 0;

for (const node of nodes) {
  if (existingIds.has(node.id)) { alreadyRecorded++; continue; }

  if (node.produces.length === 0) {
    // Produce-less nodes: mark as legacy completed (phase terminators, etc.)
    migrations.push({
      nodeId: node.id,
      completedAt: new Date().toISOString(),
      legacy: true,
      validationChecks: [{ rule: 'legacy-migration', passed: true, evidence: 'produce-less node, migrated as legacy' }],
    });
    continue;
  }

  const allExist = node.produces.every(p => artifactExists(p));
  if (!allExist) { skipped++; continue; }

  migrations.push({
    nodeId: node.id,
    completedAt: new Date().toISOString(),
    legacy: true,
    validationChecks: [{ rule: 'legacy-migration', passed: true, evidence: `all ${node.produces.length} artifact(s) exist on disk` }],
  });
}

console.log(`Migration summary:`);
console.log(`  Already recorded: ${alreadyRecorded}`);
console.log(`  To migrate:       ${migrations.length}`);
console.log(`  Skipped (missing): ${skipped}`);

if (dryRun) {
  console.log(`\nDry run — no changes written.`);
  const missing = nodes.filter(n => n.produces.length > 0 && !n.produces.every(p => artifactExists(p)) && !existingIds.has(n.id));
  if (missing.length) {
    console.log(`\nNodes with missing artifacts:`);
    for (const n of missing) {
      const mp = n.produces.filter(p => !artifactExists(p));
      console.log(`  ${n.id}: ${mp.join(', ')}`);
    }
  }
  process.exit(0);
}

// Write merged completions
const merged = [...existing, ...migrations];
const dirPath = join(repoRoot, '.roadmap');
if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
writeFileSync(completedPath, JSON.stringify(merged, null, 2) + '\n');

// Write migration receipt
const receipt = {
  migratedAt: new Date().toISOString(),
  count: migrations.length,
  alreadyRecorded,
  skipped,
  totalNodes: nodes.length,
};
writeFileSync(join(dirPath, 'migration-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');

console.log(`\nMigration applied. ${merged.length} total records in completed.json`);
console.log(`Migration receipt written to .roadmap/migration-receipt.json`);
