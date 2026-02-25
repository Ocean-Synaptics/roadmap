#!/usr/bin/env node

/**
 * Expand phase 13: Consumption surface
 *
 * Tier 1 (housekeeping): docs restructure, module map + export table
 * Tier 2 (primitives):   predicate builders, parallelOrder, RoadmapError
 * Tier 3 (CLI):          bin/roadmap with subcommands including describe
 *
 * Dependency chain:
 *   phase-12-term
 *     ├── docs-restructure → api-surface-docs ─┐
 *     ├── predicate-builders ──────────────────┤
 *     ├── parallel-order ─────────────────────┤
 *     └── error-model ────────────────────────┤
 *                                              ├── cli-binary → phase-13-test → phase-13-term → term
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Detach term — reattach after phase 13
const oldTerm = dag.nodes.term;
delete dag.nodes.term;

// --- Tier 1: Housekeeping ---

dag.nodes['docs-restructure'] = {
  id: 'docs-restructure',
  desc: 'Move dev history docs to docs/archive/, keep only README/CHANGELOG/PROTOCOL/SKILL at root',
  produces: [
    'docs/archive/orientation.md',
    'docs/archive/reorientation.md',
    'docs/archive/reorientation-phase5.md',
    'docs/archive/ADOPTION-AUDIT.md',
    'docs/archive/SPEC.md',
    'docs/archive/PROMPT.md',
    'docs/archive/RELEASE-ROADMAP.md',
    'docs/archive/AUDIT.md',
  ],
  consumes: [],
  deps: ['phase-12-term'],
  validate: [
    { type: 'artifact-exists', target: 'docs/archive/orientation.md' },
    { type: 'artifact-exists', target: 'docs/archive/SPEC.md' },
  ],
  idempotent: true,
};

dag.nodes['api-surface-docs'] = {
  id: 'api-surface-docs',
  desc: 'Export map table in README + module map (structured file headers or docs/MODULE-MAP.md)',
  produces: [
    'docs/MODULE-MAP.md',
  ],
  consumes: [
    'docs/archive/orientation.md', // needs clean root to know what stays
  ],
  deps: ['docs-restructure'],
  validate: [
    { type: 'artifact-exists', target: 'docs/MODULE-MAP.md' },
  ],
  idempotent: true,
};

// --- Tier 2: Core primitives (parallel from phase-12-term) ---

dag.nodes['predicate-builders'] = {
  id: 'predicate-builders',
  desc: 'Curried exists predicates: fileExists(root), gitArtifactExists(root), compound(...preds)',
  produces: [
    'src/predicates.ts',
    'tests/predicates.test.ts',
  ],
  consumes: [],
  deps: ['phase-12-term'],
  validate: [
    { type: 'artifact-exists', target: 'src/predicates.ts' },
    { type: 'artifact-exists', target: 'tests/predicates.test.ts' },
  ],
  idempotent: true,
};

dag.nodes['parallel-order'] = {
  id: 'parallel-order',
  desc: 'parallelOrder(g) → string[][] — batches of mutually independent nodes for concurrent execution',
  produces: [
    'tests/parallel-order.test.ts',
  ],
  consumes: [],
  deps: ['phase-12-term'],
  validate: [
    { type: 'artifact-exists', target: 'tests/parallel-order.test.ts' },
  ],
  idempotent: true,
};

dag.nodes['error-model'] = {
  id: 'error-model',
  desc: 'RoadmapError class: typed codes (POSITION_MISMATCH, CONTRACT_VIOLATION, ...) + fix field + entry point',
  produces: [
    'src/errors.ts',
    'tests/errors.test.ts',
  ],
  consumes: [],
  deps: ['phase-12-term'],
  validate: [
    { type: 'artifact-exists', target: 'src/errors.ts' },
    { type: 'artifact-exists', target: 'tests/errors.test.ts' },
  ],
  idempotent: true,
};

// --- Tier 3: CLI binary (depends on all above) ---

dag.nodes['cli-binary'] = {
  id: 'cli-binary',
  desc: 'bin/roadmap CLI: orient, advance, describe, validate subcommands. JSON stdout. package.json bin entry.',
  produces: [
    'bin/roadmap.ts',
    'tests/cli.test.ts',
  ],
  consumes: [
    'docs/MODULE-MAP.md',
    'src/predicates.ts',
    'src/errors.ts',
    'tests/parallel-order.test.ts',
  ],
  deps: ['api-surface-docs', 'predicate-builders', 'parallel-order', 'error-model'],
  validate: [
    { type: 'artifact-exists', target: 'bin/roadmap.ts' },
    { type: 'artifact-exists', target: 'tests/cli.test.ts' },
  ],
  idempotent: true,
};

// --- Phase gate ---

dag.nodes['phase-13-term'] = {
  id: 'phase-13-term',
  desc: 'Phase 13 complete: Consumption surface (CLI binary, predicates, parallelOrder, error model, clean docs)',
  produces: [],
  consumes: [
    'bin/roadmap.ts',
    'tests/cli.test.ts',
  ],
  deps: ['cli-binary'],
  validate: [],
  idempotent: false,
};

// Reattach term
oldTerm.deps = ['phase-13-term'];
oldTerm.desc = 'v0.5.0-consumption-ready: All phases complete, CLI binary ships, clean API surface';
dag.nodes.term = oldTerm;

// Validate
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

// Write
writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✓ Phase 13 expanded: 7 new nodes, DAG valid');
console.log(`Total nodes: ${Object.keys(dag.nodes).length}`);
console.log('\nDependency graph:');
console.log('  phase-12-term');
console.log('    ├── docs-restructure → api-surface-docs ─┐');
console.log('    ├── predicate-builders ──────────────────┤');
console.log('    ├── parallel-order ─────────────────────┤');
console.log('    └── error-model ────────────────────────┤');
console.log('                                             └── cli-binary → phase-13-term → term');
