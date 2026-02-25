#!/usr/bin/env node

/**
 * Phase 13b: Add file-headers, repo-cleanup, claude-md nodes.
 * Update api-surface-docs and cli-binary descriptions to cover folded items.
 * Update deps so cli-binary depends on file-headers, phase-13-term depends on claude-md + repo-cleanup.
 *
 * Updated dependency graph:
 *   phase-12-term
 *     ├── docs-restructure ─┬── api-surface-docs ─┬── claude-md ──────────┐
 *     │                      └── file-headers ────┤                       │
 *     ├── predicate-builders ────────────────────┤                       │
 *     ├── parallel-order ───────────────────────┤                       │
 *     ├── error-model ──────────────────────────┤                       │
 *     └── repo-cleanup ─────────────────────────│───────────────────────┤
 *                                                └── cli-binary ────────┤
 *                                                                       └── phase-13-term → term
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// --- New nodes ---

dag.nodes['file-headers'] = {
  id: 'file-headers',
  desc: 'Structured @module/@exports/@types/@entry headers in all src/ files. Enables grep-based API discovery.',
  produces: [],
  consumes: [
    'docs/archive/orientation.md', // needs docs moved first to know final layout
  ],
  deps: ['docs-restructure'],
  validate: [],
  idempotent: true,
};

dag.nodes['repo-cleanup'] = {
  id: 'repo-cleanup',
  desc: 'Remove stale .roadmap/ expansion scripts, tests/adoption/ scaffolding, dead artifacts from completed phases',
  produces: [],
  consumes: [],
  deps: ['phase-12-term'],
  validate: [],
  idempotent: true,
};

dag.nodes['claude-md'] = {
  id: 'claude-md',
  desc: 'Update .claude/CLAUDE.md for consumer LLMs: module map, export table, type signatures, usage examples',
  produces: [],
  consumes: [
    'docs/MODULE-MAP.md', // needs export map as source
  ],
  deps: ['api-surface-docs'],
  validate: [],
  idempotent: true,
};

// --- Update existing node descriptions to cover folded items ---

dag.nodes['api-surface-docs'].desc =
  'Export map in README (all 6 entry points incl. roadmap/agent), module map, types-at-a-glance, orient↔orientCached signpost';

dag.nodes['cli-binary'].desc =
  'bin/roadmap CLI: orient, advance, describe, validate subcommands. JSON stdout. describeGraph() via describe. package.json bin entry.';

// --- Update deps ---

// cli-binary now also depends on file-headers (describe reads them)
dag.nodes['cli-binary'].deps = [
  'api-surface-docs',
  'predicate-builders',
  'parallel-order',
  'error-model',
  'file-headers',
];

// phase-13-term depends on cli-binary + claude-md + repo-cleanup
dag.nodes['phase-13-term'].deps = ['cli-binary', 'claude-md', 'repo-cleanup'];
dag.nodes['phase-13-term'].desc =
  'Phase 13 complete: Consumption surface (CLI, predicates, parallelOrder, errors, clean docs, file headers, CLAUDE.md)';

// --- Validate ---

const checkResult = check(dag);
if (!checkResult.done) {
  console.error('ERROR: DAG not connected after expansion');
  console.error('Orphans:', checkResult.orphans);
  process.exit(1);
}

const verifyErrors = verify(dag);
if (verifyErrors.length) {
  console.error('ERROR: Contract violations:', verifyErrors);
  process.exit(1);
}

// --- Write ---

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✓ Phase 13 updated: +3 nodes (file-headers, repo-cleanup, claude-md)');
console.log(`Total nodes: ${Object.keys(dag.nodes).length}`);
console.log('\nUpdated dependency graph:');
console.log('  phase-12-term');
console.log('    ├── docs-restructure ─┬── api-surface-docs ─┬── claude-md ──────────┐');
console.log('    │                      └── file-headers ────┤                       │');
console.log('    ├── predicate-builders ────────────────────┤                       │');
console.log('    ├── parallel-order ───────────────────────┤                       │');
console.log('    ├── error-model ──────────────────────────┤                       │');
console.log('    └── repo-cleanup ─────────────────────────│───────────────────────┤');
console.log('                                               └── cli-binary ────────┤');
console.log('                                                                      └── phase-13-term → term');
