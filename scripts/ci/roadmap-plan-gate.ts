#!/usr/bin/env npx tsx
// @module plan-gate
// @exports (CI script — no programmatic exports)
//
// FR-GOV-010: Roadmap plan-gate.
// Asserts every governed file changed in the current diff is covered by a
// qualifying Track 0 rm-* node in .roadmap/head.json.
//
// A file is "governed" if it appears in any node's `produces` or `affects`.
// A governed file is "covered" if at least one rm-* Track 0 node lists it
// in its `produces` or `affects`.
//
// Exit 0: all governed changes covered (or no governed files changed).
// Exit 1: at least one governed file lacks a qualifying rm-* Track 0 node.
//
// Args:
//   argv[2]         base ref (default: env BASE_REF or HEAD~1)
//
// stdout: JSON { passed, governed, ungoverned, violations }

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// --- Types (local; track and affects are new fields not yet in NodeSpec) ---

interface HeadNode {
  id: string;
  produces?: string[];
  affects?: string[];  // additional governed paths beyond produces
  track?: number;      // 0 = Track 0 (default when absent)
}

interface HeadGraph {
  nodes: Record<string, HeadNode>;
}

// --- Config ---

const root = join(import.meta.dirname, '../..');
const headPath = join(root, '.roadmap', 'head.json');
const baseRef = process.argv[2] ?? process.env['BASE_REF'] ?? 'HEAD~1';

// --- Load DAG ---

if (!existsSync(headPath)) {
  process.stdout.write(JSON.stringify({ ok: false, error: `head.json not found: ${headPath}` }) + '\n');
  process.exit(1);
}

const dag: HeadGraph = JSON.parse(readFileSync(headPath, 'utf-8'));
const nodes: HeadNode[] = Object.values(dag.nodes);

// --- Get changed files ---

let changedFiles: string[];
try {
  const out = execSync(`git diff --name-only ${baseRef} HEAD`, {
    cwd: root,
    encoding: 'utf-8',
  });
  changedFiles = out.split('\n').map(f => f.trim()).filter(Boolean);
} catch {
  process.stdout.write(JSON.stringify({ ok: false, error: `git diff failed for base ref: ${baseRef}` }) + '\n');
  process.exit(1);
}

// --- Build governance map: file → all nodes that list it ---
// A node governs a file if the file appears in produces or affects.
// A node qualifies as a plan-gate approver if:
//   - id matches /^rm-/
//   - track === 0 or track === undefined (defaults to 0)

const governedBy = new Map<string, HeadNode[]>(); // file → all nodes that mention it
const qualifiedBy = new Map<string, HeadNode[]>(); // file → rm-* Track 0 nodes

for (const node of nodes) {
  const paths = [...(node.produces ?? []), ...(node.affects ?? [])];
  const isQualified = /^rm-/.test(node.id) && (node.track === 0 || node.track === undefined);

  for (const p of paths) {
    if (!governedBy.has(p)) governedBy.set(p, []);
    governedBy.get(p)!.push(node);

    if (isQualified) {
      if (!qualifiedBy.has(p)) qualifiedBy.set(p, []);
      qualifiedBy.get(p)!.push(node);
    }
  }
}

// --- Classify changed files ---

const governed: string[] = [];
const ungoverned: string[] = [];
const violations: { file: string; coveredBy: string[] }[] = [];

for (const file of changedFiles) {
  if (!governedBy.has(file)) {
    ungoverned.push(file);
    continue;
  }

  governed.push(file);

  const covering = qualifiedBy.get(file) ?? [];
  if (covering.length === 0) {
    violations.push({ file, coveredBy: [] });
  }
}

// --- Report ---

const passed = violations.length === 0;

const result = { passed, governed, ungoverned, violations };
process.stdout.write(JSON.stringify(result, null, 2) + '\n');

if (!passed) {
  process.stderr.write(
    `\nplan-gate: ${violations.length} governed file(s) lack a qualifying rm-* Track 0 node:\n` +
    violations.map(v => `  - ${v.file}`).join('\n') + '\n',
  );
  process.exit(1);
}

process.exit(0);
