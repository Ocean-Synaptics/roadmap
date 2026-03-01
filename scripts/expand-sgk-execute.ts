#!/usr/bin/env npx tsx
// Expansion: SGK-1 execute nodes — children of sgk-plan.
// Adds 8+ nodes with expandedFrom: 'sgk-plan' to satisfy the expanded validator.
// These are reference markers in the parent DAG; the full sgk DAG was imported separately.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

const sgkChildren: Record<string, any> = {
  'sgk-foundation': {
    id: 'sgk-foundation',
    desc: 'SGK L00 — run manifest, error codes, kernel config extensions',
    produces: ['src/lib/sgk/run-manifest.ts', 'src/lib/sgk/kernel-ext.ts'],
    consumes: [],
    deps: ['sgk-plan'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/run-manifest.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/kernel-ext.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-receipts': {
    id: 'sgk-receipts',
    desc: 'SGK L01 — all receipt types R1-R8 (strategy, plan, intent, mine, audit, close, display)',
    produces: [
      'src/lib/sgk/receipts/strategy.ts',
      'src/lib/sgk/receipts/plan.ts',
      'src/lib/sgk/receipts/intent.ts',
      'src/lib/sgk/receipts/mine.ts',
      'src/lib/sgk/receipts/audit.ts',
      'src/lib/sgk/receipts/close.ts',
      'src/lib/sgk/receipts/display.ts',
    ],
    consumes: ['src/lib/sgk/run-manifest.ts'],
    deps: ['sgk-foundation'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/receipts/strategy.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/receipts/close.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-cli-enforce': {
    id: 'sgk-cli-enforce',
    desc: 'SGK L02 — CLI enforcement: runid injection, dispatch gates, complete binding, close gates',
    produces: [
      'src/lib/sgk/cli/run-enforce.ts',
      'src/lib/sgk/cli/dispatch-gates.ts',
      'src/lib/sgk/cli/complete-binding.ts',
      'src/lib/sgk/cli/close-gates.ts',
    ],
    consumes: ['src/lib/sgk/receipts/strategy.ts', 'src/lib/sgk/receipts/intent.ts'],
    deps: ['sgk-receipts'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/cli/run-enforce.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/cli/dispatch-gates.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-strategy-surface': {
    id: 'sgk-strategy-surface',
    desc: 'SGK L03 — strategy listing, auto-select receipt, orient surface',
    produces: ['src/lib/sgk/strategy-surface.ts', 'src/lib/sgk/strategy-auto.ts'],
    consumes: ['src/lib/sgk/cli/run-enforce.ts', 'src/lib/sgk/receipts/strategy.ts'],
    deps: ['sgk-cli-enforce'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/strategy-surface.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/strategy-auto.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-intent-cmds': {
    id: 'sgk-intent-cmds',
    desc: 'SGK L04 — init intent command, term intent command, intent binding drift detection',
    produces: [
      'src/lib/sgk/cli/intent-init.ts',
      'src/lib/sgk/cli/intent-term.ts',
      'src/lib/sgk/intent-binding.ts',
    ],
    consumes: ['src/lib/sgk/cli/dispatch-gates.ts', 'src/lib/sgk/receipts/intent.ts'],
    deps: ['sgk-strategy-surface'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/cli/intent-init.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/intent-binding.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-mine-audit': {
    id: 'sgk-mine-audit',
    desc: 'SGK L05 — mining, audit, strategy detectors, chain detectors',
    produces: [
      'src/lib/sgk/mine.ts',
      'src/lib/sgk/audit.ts',
      'src/lib/sgk/detectors/strategy.ts',
      'src/lib/sgk/detectors/chain.ts',
    ],
    consumes: ['src/lib/sgk/intent-binding.ts', 'src/lib/sgk/receipts/close.ts'],
    deps: ['sgk-intent-cmds'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/mine.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/audit.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-display': {
    id: 'sgk-display',
    desc: 'SGK L06 — display receipt writer, human render hooks, term intent display requirement',
    produces: [
      'src/lib/sgk/display.ts',
      'src/lib/sgk/render.ts',
      'src/lib/sgk/term-display-check.ts',
    ],
    consumes: ['src/lib/sgk/mine.ts', 'src/lib/sgk/audit.ts'],
    deps: ['sgk-mine-audit'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/sgk/display.ts' },
      { type: 'artifact-exists', path: 'src/lib/sgk/render.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
  'sgk-e2e': {
    id: 'sgk-e2e',
    desc: 'SGK L07 — contract tests, e2e run flow test, terminal gate',
    produces: ['tests/sgk/contract.test.ts', 'tests/sgk/e2e-run-flow.test.ts'],
    consumes: [
      'src/lib/sgk/display.ts',
      'src/lib/sgk/render.ts',
      'src/lib/sgk/term-display-check.ts',
    ],
    deps: ['sgk-display'],
    validate: [
      { type: 'shell', cmd: 'npx tsc --noEmit' },
      { type: 'artifact-exists', path: 'tests/sgk/e2e-run-flow.test.ts' },
    ],
    idempotent: false,
    expandedFrom: 'sgk-plan',
  },
};

for (const [id, node] of Object.entries(sgkChildren)) {
  graph.nodes[id] = node;
}

// Wire sgk-e2e into integration-terminal deps
if (graph.nodes['integration-terminal'] && !graph.nodes['integration-terminal'].deps.includes('sgk-e2e')) {
  graph.nodes['integration-terminal'].deps.push('sgk-e2e');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log(`Expanded: ${Object.keys(sgkChildren).length} sgk execute nodes added with expandedFrom: sgk-plan`);
