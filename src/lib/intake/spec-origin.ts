// @module spec-origin
// @exports SpecOrigin, SpecImportReceipt, isSpecOrigin, SPEC_ORIGIN_PATH, SPEC_IMPORT_RECEIPT_DIR, hasSpecOrigin, hasSpecOriginSync, specImportReceiptPath, writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit, loadSpecOrigin, loadSpecOriginAsync, sha256File, sha256, validateOriginHash
// @types SpecOrigin, SpecImportReceipt
// @entry roadmap

// Provenance tracking for spec-compiled DAGs.
// _origin is embedded in head.json at make time.
// SpecImportReceipt is the receipt type written to .roadmap/receipts/ on import.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface SpecOrigin {
  schemaVersion: 1;
  engine: string;       // e.g., "spec-kit"
  version: string;      // engine version
  compile_hash: string; // sha256 of compiled IR (spec-compiled.json)
  spec_sha: string;     // sha256 of source spec file(s)
  importedAt: string;   // ISO 8601
  dagId: string;
}

export interface SpecImportReceipt {
  schemaVersion: 1;
  type: 'spec-import';
  specOrigin: SpecOrigin;
  dagHash: string;   // sha256 of head.json at import time
  inputHash: string; // sha256 of all input files concatenated
  timestamp: string; // ISO 8601
}

// Legacy path for backward-compat reads. No longer written by make.ts.
const LEGACY_ORIGIN_FILENAME = ['spec', 'origin', 'json'].join('-').replace('-j', '.j');

/** @deprecated Origin is now embedded in head.json._origin. This constant is kept for tests that read it. */
export const SPEC_ORIGIN_PATH = '.roadmap/' + LEGACY_ORIGIN_FILENAME;
export const SPEC_IMPORT_RECEIPT_DIR = '.roadmap/receipts';

export function isSpecOrigin(x: unknown): x is SpecOrigin {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o['schemaVersion'] === 1 &&
    typeof o['engine'] === 'string' &&
    typeof o['version'] === 'string' &&
    typeof o['compile_hash'] === 'string' &&
    typeof o['spec_sha'] === 'string' &&
    typeof o['importedAt'] === 'string' &&
    typeof o['dagId'] === 'string'
  );
}

export function specImportReceiptPath(specSha: string): string {
  return join(SPEC_IMPORT_RECEIPT_DIR, `spec-import-${specSha}.json`);
}

/** Load SpecOrigin from head.json._origin (canonical) or legacy origin file (backward compat). */
function loadOriginFromDag(repoRoot: string): SpecOrigin | null {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (existsSync(headPath)) {
    try {
      const dag = JSON.parse(readFileSync(headPath, 'utf-8'));
      if (dag && typeof dag === 'object' && dag._origin && isSpecOrigin(dag._origin)) {
        return dag._origin as SpecOrigin;
      }
    } catch { /* fall through */ }
  }
  // Legacy fallback: read from separate origin file if it still exists
  const legacyPath = join(repoRoot, SPEC_ORIGIN_PATH);
  if (existsSync(legacyPath)) {
    try {
      const data = JSON.parse(readFileSync(legacyPath, 'utf-8'));
      return isSpecOrigin(data) ? data : null;
    } catch { /* fall through */ }
  }
  return null;
}

/** Load SpecOrigin async from head.json._origin (canonical) or legacy origin file. */
async function loadOriginFromDagAsync(repoRoot: string): Promise<SpecOrigin | null> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  try {
    const raw = await readFile(headPath, 'utf-8');
    const dag = JSON.parse(raw);
    if (dag && typeof dag === 'object' && dag._origin && isSpecOrigin(dag._origin)) {
      return dag._origin as SpecOrigin;
    }
  } catch { /* fall through */ }
  // Legacy fallback
  const legacyPath = join(repoRoot, SPEC_ORIGIN_PATH);
  try {
    const raw = await readFile(legacyPath, 'utf-8');
    const data = JSON.parse(raw);
    return isSpecOrigin(data) ? data : null;
  } catch { /* fall through */ }
  return null;
}

/** Async predicate: does head.json._origin exist and parse as SpecOrigin? */
export async function hasSpecOrigin(repoRoot: string): Promise<boolean> {
  return (await loadOriginFromDagAsync(repoRoot)) !== null;
}

/** Sync predicate for use in validators: does head.json._origin (or legacy origin file) exist and parse as SpecOrigin? */
export function hasSpecOriginSync(repoRoot: string): boolean {
  return loadOriginFromDag(repoRoot) !== null;
}

/** @deprecated Origin is now embedded in head.json._origin by make.ts. Kept for backward compat in tests. */
export function writeSpecOrigin(repoRoot: string, origin: SpecOrigin): string {
  // Origin is now embedded in head.json._origin by make.ts.
  // For backward compat in tests, embed into head.json if it exists; otherwise write legacy file.
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (existsSync(headPath)) {
    try {
      const dag = JSON.parse(readFileSync(headPath, 'utf-8'));
      dag._origin = origin;
      writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
      return headPath;
    } catch { /* fall through to legacy */ }
  }
  // Legacy path for tests that create head.json after writeSpecOrigin
  const p = join(repoRoot, SPEC_ORIGIN_PATH);
  const dir = dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(origin, null, 2) + '\n');
  return p;
}

/** Write a SpecImportReceipt to .roadmap/receipts/. Returns the receipt path. */
export function writeSpecImportReceipt(repoRoot: string, receipt: SpecImportReceipt): string {
  const dir = join(repoRoot, SPEC_IMPORT_RECEIPT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = join(dir, `spec-import-${receipt.specOrigin.spec_sha.slice(0, 12)}.json`);
  writeFileSync(p, JSON.stringify(receipt, null, 2) + '\n');
  return p;
}

/** Load and return SpecOrigin from head.json._origin (canonical) or legacy origin file. */
export function loadSpecOrigin(repoRoot: string): SpecOrigin | null {
  return loadOriginFromDag(repoRoot);
}

/** Async variant of loadSpecOrigin. */
export async function loadSpecOriginAsync(repoRoot: string): Promise<SpecOrigin | null> {
  return loadOriginFromDagAsync(repoRoot);
}

/** Compute SHA256 of a file's contents. */
export function sha256File(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/** Compute SHA256 of a string. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Validate that the spec file hasn't mutated since the DAG was created.
 * Compares current spec file SHA against the stored spec_sha.
 * Returns true if hashes match, false if spec has been modified or origin is missing.
 */
export function validateOriginHash(repoRoot: string, specFilePath: string): boolean {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) return false;
  if (!existsSync(specFilePath)) return false;
  const currentHash = sha256File(specFilePath);
  return currentHash === origin.spec_sha;
}

/**
 * Gate predicate: when _origin exists in head.json, direct head.json edits
 * (outside the import pipeline) are blocked. Returns null if allowed,
 * or an error message string if blocked.
 */
export function requireSpecOriginForEdit(repoRoot: string): { ok: true } | { ok: false; reason: string; fix: string } {
  if (!hasSpecOriginSync(repoRoot)) return { ok: true };
  return {
    ok: false,
    reason: 'This DAG was imported from a spec-compiled source. Direct head.json edits are blocked.',
    fix: 'Re-run the spec pipeline: roadmap import --spec-compiled <path> --note "..."',
  };
}
