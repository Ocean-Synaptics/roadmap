#!/usr/bin/env npx tsx
// test-ledger-prune: remove ledger entries for tests that now pass.
// Manual command — never runs in CI.
//
// Usage: npm run ledger:tests:prune
//   --dry-run  to preview without writing

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const root = join(import.meta.dirname, '..');
const vitestPath = process.env.VITEST_JSON || join(root, '.vitest-results.json');
const ledgerPath = join(root, 'scripts', 'test-ledger.json');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(vitestPath)) {
  console.error(`vitest JSON not found: ${vitestPath}`);
  console.error('Run: npm run test:ci first');
  process.exit(1);
}
if (!existsSync(ledgerPath)) {
  console.error('No ledger found. Run: npm run ledger:tests:init');
  process.exit(1);
}

const vitest = JSON.parse(readFileSync(vitestPath, 'utf-8'));
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

// collect current failure keys
const failingKeys = new Set<string>();
for (const suite of vitest.testResults ?? []) {
  const file = suite.name?.replace(/^.*\/roadmap\//, '') ?? suite.name;
  for (const t of suite.assertionResults ?? []) {
    if (t.status === 'failed') {
      failingKeys.add(`${file}::${t.fullName}`);
    }
  }
}

// find entries to prune
const pruned: string[] = [];
for (const key of Object.keys(ledger.entries)) {
  if (!failingKeys.has(key)) {
    pruned.push(key);
    if (!dryRun) delete ledger.entries[key];
  }
}

if (pruned.length === 0) {
  console.log('Nothing to prune — all ledger entries still failing.');
  process.exit(0);
}

if (dryRun) {
  console.log(`Would prune ${pruned.length} entries:`);
  for (const k of pruned) console.log(`  - ${k}`);
} else {
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`Pruned ${pruned.length} entries (tests now passing).`);
  for (const k of pruned) console.log(`  - ${k}`);
  console.log(`\nRemaining: ${Object.keys(ledger.entries).length} known failures.`);
}
