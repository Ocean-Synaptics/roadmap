// @module audit
// @exports deriveLayout, generateMovePlan, TargetLayout, MovePlan, MoveEntry, LayoutBucket
// @entry roadmap/audit

import { readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename, extname } from 'path';

// --- Types ---

/** A bucket in the target layout with its enforcement rule. */
export interface LayoutBucket {
  path: string;
  description: string;
  rule: 'import-pure' | 'cli-only' | 'io-allowed' | 'any';
}

/** The target folder structure for the project. */
export interface TargetLayout {
  buckets: LayoutBucket[];
  /** Files that must not exist at top-level src/ (core logic + CLI wiring in same file). */
  noMixRule: boolean;
  /** fs/network/process calls restricted to these prefixes. */
  ioPrefixes: string[];
}

/** A single file move instruction. */
export interface MoveEntry {
  from: string;   // relative to repo root
  to: string;     // relative to repo root
  reason: string;
}

/** The complete move plan. */
export interface MovePlan {
  moves: MoveEntry[];
  /** Files already in correct location. */
  kept: string[];
  /** Files that couldn't be classified — need manual review. */
  unclassified: string[];
}

// --- Layout definition ---

const TARGET_BUCKETS: LayoutBucket[] = [
  { path: 'bin/',              description: 'single CLI entrypoint + subcommand registry', rule: 'any' },
  { path: 'src/lib/',          description: 'pure libs (no IO on import)',                 rule: 'import-pure' },
  { path: 'src/core/',         description: 'protocol/engine (dag, receipts, verify)',     rule: 'import-pure' },
  { path: 'src/cli/',          description: 'CLI adapters/renderers/envelope',             rule: 'cli-only' },
  { path: 'src/audit/',        description: 'audit + archive logic',                       rule: 'io-allowed' },
  { path: 'src/perf/',         description: 'perf budgets, harness, benchmarks',           rule: 'io-allowed' },
  { path: 'src/components/',   description: '(donjon) component system',                   rule: 'any' },
  { path: 'src/metaflow/',     description: '(roadmap) metaflow system',                   rule: 'any' },
  { path: 'tests/',            description: 'test files',                                  rule: 'any' },
  { path: 'docs/',             description: 'documentation',                               rule: 'any' },
  { path: 'archive/',          description: 'archived/deprecated code',                    rule: 'any' },
];

const IO_PREFIXES = ['src/cli/', 'src/audit/', 'src/perf/'];

// --- Classification heuristics ---

/** Keyword patterns for bucket classification. */
const CLASSIFICATION_PATTERNS: Array<{ test: (rel: string, base: string) => boolean; bucket: string }> = [
  { test: (rel) => rel.startsWith('src/lib/cli/') || rel.startsWith('src/cli/'),                bucket: 'src/cli/' },
  { test: (rel) => rel.startsWith('src/lib/audit/') || rel.startsWith('src/audit/'),            bucket: 'src/audit/' },
  { test: (rel) => rel.startsWith('src/lib/perf/') || rel.startsWith('src/perf/'),              bucket: 'src/perf/' },
  { test: (rel) => rel.startsWith('src/lib/metaflow/') || rel.startsWith('src/metaflow/'),      bucket: 'src/metaflow/' },
  { test: (rel) => rel.startsWith('src/lib/sgk/') || rel.startsWith('src/components/'),         bucket: 'src/components/' },
  { test: (rel) => rel.startsWith('src/tests/') || rel.startsWith('tests/'),                    bucket: 'tests/' },
  { test: (rel) => rel.startsWith('bin/'),                                                       bucket: 'bin/' },
  { test: (rel) => rel.startsWith('docs/'),                                                      bucket: 'docs/' },
  { test: (_, base) => base.includes('cli-') || base.includes('-cli'),                           bucket: 'src/cli/' },
  { test: (_, base) => base.includes('audit-') || base.includes('-audit'),                       bucket: 'src/audit/' },
  { test: (_, base) => base.includes('perf-') || base.includes('-perf') || base.includes('benchmark'), bucket: 'src/perf/' },
  // Core protocol files
  { test: (rel) => rel.startsWith('src/lib/') && !rel.includes('/cli/') && !rel.includes('/audit/') && !rel.includes('/perf/') && !rel.includes('/metaflow/') && !rel.includes('/sgk/'), bucket: 'src/lib/' },
];

// --- Public API ---

/**
 * Returns the target layout definition.
 * Pure function — no filesystem access.
 */
export function deriveLayout(): TargetLayout {
  return {
    buckets: TARGET_BUCKETS,
    noMixRule: true,
    ioPrefixes: IO_PREFIXES,
  };
}

/**
 * Walk a directory tree and collect all .ts files (relative paths).
 */
function collectFiles(root: string, dir: string = root): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...collectFiles(root, full));
    } else if (extname(entry) === '.ts' || extname(entry) === '.tsx') {
      results.push(relative(root, full));
    }
  }
  return results;
}

/**
 * Classify a file path into a target bucket.
 * Returns the bucket path or null if unclassifiable.
 */
function classifyFile(relPath: string): string | null {
  const base = basename(relPath);
  for (const pattern of CLASSIFICATION_PATTERNS) {
    if (pattern.test(relPath, base)) return pattern.bucket;
  }
  return null;
}

/**
 * Compute the target path for a file moving into a new bucket.
 * Preserves subdirectory structure relative to the source bucket.
 */
function computeTargetPath(relPath: string, currentBucket: string, targetBucket: string): string {
  // Strip the current bucket prefix to get the relative remainder
  let remainder: string;
  if (relPath.startsWith(currentBucket)) {
    remainder = relPath.slice(currentBucket.length);
  } else {
    // File is at a different location — use just the filename
    const dir = dirname(relPath);
    const base = basename(relPath);
    // Try to preserve one level of subdirectory context
    const parts = dir.split('/');
    const relevantParts = parts.filter(p => !['src', 'lib'].includes(p));
    remainder = relevantParts.length > 0 ? join(...relevantParts, base) : base;
  }
  return join(targetBucket, remainder);
}

/**
 * Determine which bucket a file currently lives in.
 */
function currentBucket(relPath: string): string {
  for (const bucket of TARGET_BUCKETS) {
    if (relPath.startsWith(bucket.path)) return bucket.path;
  }
  // Top-level src/ file
  if (relPath.startsWith('src/')) return 'src/';
  return '';
}

/**
 * Generate a move plan that transforms current file layout to target layout.
 *
 * @param root - Absolute path to repo root
 * @param scanDirs - Directories to scan (relative to root). Defaults to ['src', 'bin', 'tests', 'docs'].
 */
export function generateMovePlan(
  root: string,
  scanDirs: string[] = ['src', 'bin', 'tests', 'docs'],
): MovePlan {
  const moves: MoveEntry[] = [];
  const kept: string[] = [];
  const unclassified: string[] = [];

  const files: string[] = [];
  for (const dir of scanDirs) {
    files.push(...collectFiles(root, join(root, dir)));
  }

  for (const relPath of files) {
    const targetBucket = classifyFile(relPath);
    if (!targetBucket) {
      unclassified.push(relPath);
      continue;
    }

    const curBucket = currentBucket(relPath);

    // Already in the right bucket
    if (curBucket === targetBucket) {
      kept.push(relPath);
      continue;
    }

    const targetPath = computeTargetPath(relPath, curBucket, targetBucket);

    // Skip if source and target are the same
    if (relPath === targetPath) {
      kept.push(relPath);
      continue;
    }

    moves.push({
      from: relPath,
      to: targetPath,
      reason: `Move from ${curBucket || 'root'} to ${targetBucket} per layout rules`,
    });
  }

  return { moves, kept, unclassified };
}
