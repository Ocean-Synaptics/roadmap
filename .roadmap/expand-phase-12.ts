#!/usr/bin/env node

/**
 * Expand phase 12: External adoption enablement
 * Add 6 nodes for completing auto-integration and CLI
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify, define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Find current phase-11-term to understand structure
const phase11Term = dag.nodes['phase-11-term'];
console.log('phase-11-term found:', phase11Term.id);

// Remove old term → reattach it later after phase 12
const oldTerm = dag.nodes.term;
delete dag.nodes.term;

// Add phase 12 nodes
dag.nodes['integrate-gen-spec'] = {
  id: 'integrate-gen-spec',
  desc: 'Design: roadmap.ts generation strategy (bootstrap template vs. full generation)',
  produces: [
    'docs/decisions/integrate-generation.md',
  ],
  consumes: [],
  deps: ['phase-11-term'],
  validate: [
    { type: 'artifact-exists', target: 'docs/decisions/integrate-generation.md' },
  ],
  idempotent: true,
};

dag.nodes['integrate-gen-impl'] = {
  id: 'integrate-gen-impl',
  desc: 'Implementation: Generate roadmap.ts from ProjectMetadata + buildProcess, validate DAG',
  produces: [
    'src/auto-integrate-gen.ts',
  ],
  consumes: [
    'docs/decisions/integrate-generation.md',
  ],
  deps: ['integrate-gen-spec'],
  validate: [
    { type: 'artifact-exists', target: 'src/auto-integrate-gen.ts' },
    { type: 'function', target: 'compile-auto-integrate-gen', fn: 'npx tsc src/auto-integrate-gen.ts --noEmit' },
  ],
  idempotent: true,
};

dag.nodes['integrate-cli'] = {
  id: 'integrate-cli',
  desc: 'CLI entrypoint: "roadmap integrate" command with --dry-run support',
  produces: [
    'bin/roadmap-integrate.ts',
  ],
  consumes: [
    'src/auto-integrate-gen.ts',
  ],
  deps: ['integrate-gen-impl'],
  validate: [
    { type: 'artifact-exists', target: 'bin/roadmap-integrate.ts' },
    { type: 'function', target: 'compile-cli', fn: 'npx tsc bin/roadmap-integrate.ts --noEmit' },
  ],
  idempotent: true,
};

dag.nodes['integrate-test'] = {
  id: 'integrate-test',
  desc: 'Comprehensive testing: End-to-end integration tests (3+ real project patterns)',
  produces: [
    'tests/auto-integrate-full.test.ts',
  ],
  consumes: [
    'bin/roadmap-integrate.ts',
  ],
  deps: ['integrate-cli'],
  validate: [
    { type: 'artifact-exists', target: 'tests/auto-integrate-full.test.ts' },
    { type: 'function', target: 'test-integrate', fn: 'npx vitest run tests/auto-integrate-full.test.ts' },
  ],
  idempotent: true,
};

dag.nodes['integrate-docs'] = {
  id: 'integrate-docs',
  desc: 'Documentation: Adoption guide for external projects + CLI walkthrough',
  produces: [
    'docs/ADOPTION-GUIDE.md',
  ],
  consumes: [
    'tests/auto-integrate-full.test.ts',
  ],
  deps: ['integrate-test'],
  validate: [
    { type: 'artifact-exists', target: 'docs/ADOPTION-GUIDE.md' },
  ],
  idempotent: true,
};

dag.nodes['phase-12-term'] = {
  id: 'phase-12-term',
  desc: 'Phase 12 complete: External adoption enablement (CLI ready, adoption guide complete)',
  produces: [],
  consumes: [
    'docs/ADOPTION-GUIDE.md',
  ],
  deps: ['integrate-docs'],
  validate: [],
  idempotent: false,
};

// Update term to depend on phase-12-term
oldTerm.deps = ['phase-12-term'];
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

// Write back
writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✓ Phase 12 expanded: 6 new nodes, DAG valid');
console.log(`Total nodes: ${Object.keys(dag.nodes).length}`);
console.log('Dependency chain:');
console.log('  integrate-gen-spec');
console.log('  → integrate-gen-impl');
console.log('  → integrate-cli');
console.log('  → integrate-test');
console.log('  → integrate-docs');
console.log('  → phase-12-term');
console.log('  → term');
