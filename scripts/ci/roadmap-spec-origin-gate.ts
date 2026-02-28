#!/usr/bin/env npx tsx
// @module spec-origin-gate
// @exports (CI script — no programmatic exports)
//
// FR-SPEC-003: Roadmap spec-origin-gate.
// Asserts that any commit changing .roadmap/head.json has a matching
// spec-compile receipt + import receipt with a valid hash chain:
//   head.json.spec.compiled_sha256
//     → spec-compile-*.json receipt (compile_hash matches)
//     → import-*.json receipt (compile_hash + dag_hash matches sha256(head.json))
//
// Hand-crafted DAGs (no spec field) are allowed with a warning.
//
// Exit 0: head.json unchanged, no spec field (hand-crafted), or chain valid.
// Exit 1: head.json changed + spec field present + chain verification fails.
//
// Args:
//   argv[2]   base ref (default: env BASE_REF or HEAD~1)
//
// stdout: JSON { passed, headChanged, hasSpec, chainValid, details }

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// --- Local types (self-contained — no imports from src/) ---

interface SpecMeta {
  compiled_sha256: string;
  engine: { name: string; version: string | null };
  inputs: Array<{ path: string; sha256: string; role: string }>;
}

interface HeadGraph {
  id?: string;
  spec?: SpecMeta;
}

interface SpecCompileReceipt {
  type: 'spec-compile';
  compile_hash: string;
  dag_id?: string;
}

interface ImportReceipt {
  type: 'import-compiled' | string;
  compile_hash: string;
  dag_hash: string;
}

// --- Config ---

const root = join(import.meta.dirname, '../..');
const headPath = join(root, '.roadmap', 'head.json');
const receiptsDir = join(root, '.roadmap', 'receipts');
const baseRef = process.argv[2] ?? process.env['BASE_REF'] ?? 'HEAD~1';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function result(
  passed: boolean,
  headChanged: boolean,
  hasSpec: boolean,
  chainValid: boolean,
  details: string,
): never {
  process.stdout.write(JSON.stringify({ passed, headChanged, hasSpec, chainValid, details }, null, 2) + '\n');
  if (!passed) process.stderr.write(`\nspec-origin-gate: ${details}\n`);
  process.exit(passed ? 0 : 1);
}

// --- Check if head.json changed in current commit ---

let changedFiles: string[];
try {
  const out = execSync(`git diff --name-only ${baseRef} HEAD`, {
    cwd: root,
    encoding: 'utf-8',
  });
  changedFiles = out.split('\n').map(f => f.trim()).filter(Boolean);
} catch {
  result(false, false, false, false, `git diff failed for base ref: ${baseRef}`);
}

const headChanged = changedFiles.includes('.roadmap/head.json');

if (!headChanged) {
  result(true, false, false, false, 'head.json not changed — no check required');
}

// --- Load head.json ---

if (!existsSync(headPath)) {
  result(false, true, false, false, `head.json not found: ${headPath}`);
}

let dag: HeadGraph;
try {
  dag = JSON.parse(readFileSync(headPath, 'utf-8'));
} catch (e: any) {
  result(false, true, false, false, `Failed to parse head.json: ${e.message}`);
}

// --- Check for spec field ---

if (!dag.spec || !dag.spec.compiled_sha256) {
  process.stderr.write('spec-origin-gate: WARNING — head.json has no spec field (hand-crafted DAG). Allowed for now.\n');
  result(true, true, false, false, 'hand-crafted DAG (no spec.compiled_sha256) — skipping chain check');
}

const compiledSha = dag.spec!.compiled_sha256;

// --- Compute dag_hash from current head.json content ---

const headContent = readFileSync(headPath, 'utf-8');
const dagHash = sha256(headContent);

// --- Find matching spec-compile receipt ---

if (!existsSync(receiptsDir)) {
  result(false, true, true, false, `receipts directory not found: ${receiptsDir}`);
}

const allReceipts = readdirSync(receiptsDir).filter(f => f.endsWith('.json'));

let specCompileReceipt: SpecCompileReceipt | null = null;
for (const f of allReceipts.filter(f => f.startsWith('spec-compile-'))) {
  try {
    const r = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8')) as SpecCompileReceipt;
    if (r.compile_hash === compiledSha) {
      specCompileReceipt = r;
      break;
    }
  } catch {}
}

if (!specCompileReceipt) {
  result(
    false, true, true, false,
    `no spec-compile receipt found with compile_hash=${compiledSha.slice(0, 12)}... — run: roadmap spec compile`,
  );
}

// --- Find matching import receipt ---

// Import receipts: import-compiled (from --spec-compiled) or import-speckit (from --from speckit).
// Both write compile_hash and dag_hash.

let importReceipt: ImportReceipt | null = null;
for (const f of allReceipts.filter(f => f.startsWith('import-') && !f.startsWith('import-compiled'))) {
  // Prefix covers: import-<sha>.json (from cmdImportCompiled) — type is 'import-compiled'
  try {
    const r = JSON.parse(readFileSync(join(receiptsDir, f), 'utf-8')) as ImportReceipt;
    if (r.compile_hash === compiledSha && r.dag_hash === dagHash) {
      importReceipt = r;
      break;
    }
  } catch {}
}

if (!importReceipt) {
  result(
    false, true, true, false,
    `no import receipt found with compile_hash=${compiledSha.slice(0, 12)}... and dag_hash=${dagHash.slice(0, 12)}... — run: roadmap import --spec-compiled <path>`,
  );
}

// --- All checks passed ---

result(
  true, true, true, true,
  `chain verified: compiled_sha256=${compiledSha.slice(0, 12)}... dag_hash=${dagHash.slice(0, 12)}...`,
);
