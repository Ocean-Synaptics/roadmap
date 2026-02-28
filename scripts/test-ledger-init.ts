#!/usr/bin/env npx tsx
// test-ledger-init: generate baseline test-ledger.json from current vitest failures.
// Manual command — never runs in CI.
//
// Usage: npm run ledger:tests:init
//   VITEST_JSON=path npm run ledger:tests:init  (custom results file)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const root = join(import.meta.dirname, '..');
const vitestPath = process.env.VITEST_JSON || join(root, '.vitest-results.json');
const ledgerPath = join(root, 'scripts', 'test-ledger.json');

if (!existsSync(vitestPath)) {
  console.error(`vitest JSON not found: ${vitestPath}`);
  console.error('Run: npm run test:ci first');
  process.exit(1);
}

const vitest = JSON.parse(readFileSync(vitestPath, 'utf-8'));

// current commit for firstSeenCommit
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf-8' }).trim();
} catch {}

type LedgerEntry = {
  file: string;
  testPath: string[];
  testName: string;
  firstSeenCommit: string;
  class: 'deterministic' | 'flaky' | 'spec-mismatch' | 'infra';
  note: string;
};

const entries: Record<string, LedgerEntry> = {};

for (const suite of vitest.testResults ?? []) {
  const file = suite.name?.replace(/^.*\/roadmap\//, '') ?? suite.name;
  for (const t of suite.assertionResults ?? []) {
    if (t.status !== 'failed') continue;
    const key = `${file}::${t.fullName}`;
    entries[key] = {
      file,
      testPath: t.ancestorTitles ?? [],
      testName: t.fullName,
      firstSeenCommit: commit,
      class: 'deterministic',
      note: '',
    };
  }
}

const ledger = {
  version: 1,
  generated: new Date().toISOString(),
  entries,
};

writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
console.log(`test-ledger.json: ${Object.keys(entries).length} known failures written`);
console.log(`path: ${ledgerPath}`);
