#!/usr/bin/env npx tsx
// test-ledger-gate: ratcheting test governance.
// Compares vitest JSON output against test-ledger.json baseline.
// Hard-fails on net-new failures. Reports known vs new vs missing.
//
// ENV:
//   VITEST_JSON  — path to vitest JSON output (default: .vitest-results.json)
//   LEDGER_STRICT — "1" to fail on missing ledger entries (tests that now pass)
//   LEDGER_ALLOW  — "1" to allow ledger file modifications in CI
//
// stdout: JSON { ok, known_failures, new_failures, missing_failures, flaky_suspects, ledger_hash }
// exit 1 on new regressions or policy violation.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const root = join(import.meta.dirname, '..');
const vitestPath = process.env.VITEST_JSON || join(root, '.vitest-results.json');
const ledgerPath = join(root, 'scripts', 'test-ledger.json');
const schemaPath = join(root, 'scripts', 'test-ledger.schema.json');

const strict = process.env.LEDGER_STRICT === '1';
const allowLedgerMod = process.env.LEDGER_ALLOW === '1';

// --- load vitest results ---
if (!existsSync(vitestPath)) {
  process.stdout.write(JSON.stringify({ ok: false, error: `vitest JSON not found: ${vitestPath}` }) + '\n');
  process.exit(1);
}
const vitest = JSON.parse(readFileSync(vitestPath, 'utf-8'));

// --- extract failures ---
type FailEntry = { file: string; testPath: string[]; testName: string };
const failures: FailEntry[] = [];
for (const suite of vitest.testResults ?? []) {
  const file = suite.name?.replace(/^.*\/roadmap\//, '') ?? suite.name;
  for (const t of suite.assertionResults ?? []) {
    if (t.status === 'failed') {
      failures.push({ file, testPath: t.ancestorTitles ?? [], testName: t.fullName });
    }
  }
}

// --- key function ---
function entryKey(file: string, testName: string): string {
  return `${file}::${testName}`;
}

// --- load ledger ---
if (!existsSync(ledgerPath)) {
  process.stdout.write(JSON.stringify({ ok: false, error: `ledger not found: ${ledgerPath}. Run: npm run ledger:tests:init` }) + '\n');
  process.exit(1);
}
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf-8'));

// --- validate ledger shape ---
if (ledger.version !== 1 || typeof ledger.entries !== 'object') {
  process.stdout.write(JSON.stringify({ ok: false, error: 'ledger shape invalid — expected { version: 1, entries: {} }' }) + '\n');
  process.exit(1);
}

const ledgerHash = createHash('sha256').update(readFileSync(ledgerPath)).digest('hex').slice(0, 12);
const ledgerKeys = new Set(Object.keys(ledger.entries));

// --- classify ---
const knownFailures: string[] = [];
const newFailures: string[] = [];
const failureKeys = new Set<string>();

for (const f of failures) {
  const key = entryKey(f.file, f.testName);
  failureKeys.add(key);
  if (ledgerKeys.has(key)) {
    knownFailures.push(key);
  } else {
    newFailures.push(key);
  }
}

// missing = in ledger but not in current failures (tests that now pass or were renamed)
const missingFailures = [...ledgerKeys].filter(k => !failureKeys.has(k));

// flaky suspects = entries classified as flaky in the ledger
const flakySuspects = Object.entries(ledger.entries)
  .filter(([, v]: [string, any]) => v.class === 'flaky')
  .map(([k]) => k);

// --- gate logic ---
let ok = true;
const reasons: string[] = [];

if (newFailures.length > 0) {
  ok = false;
  reasons.push(`${newFailures.length} new regression(s) not in ledger`);
}

if (strict && missingFailures.length > 0) {
  ok = false;
  reasons.push(`${missingFailures.length} ledger entry/entries no longer failing (LEDGER_STRICT=1). Run: npm run ledger:tests:prune`);
}

const result = {
  ok,
  known_failures: knownFailures.length,
  new_failures: newFailures.length,
  missing_failures: missingFailures.length,
  flaky_suspects: flakySuspects.length,
  ledger_hash: ledgerHash,
  ...(newFailures.length > 0 ? { new_failure_details: newFailures } : {}),
  ...(strict && missingFailures.length > 0 ? { missing_failure_details: missingFailures } : {}),
  ...(reasons.length > 0 ? { reasons } : {}),
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(ok ? 0 : 1);
