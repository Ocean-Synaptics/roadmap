/**
 * Multi-project adoption: Cockpit + Fusion + Regent
 *
 * Demonstrates:
 * - Cross-repo blocking dependencies
 * - Parallel agent coordination
 * - Shared artifact tracking
 */

import { test, expect } from 'vitest';
import { define, parallelOrder } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

// Cockpit roadmap: depends on Fusion output
const cockpitRoadmap: Graph<string> = {
  id: 'cockpit-project',
  desc: 'Cockpit: unified agent control plane',
  init: 'bootstrap',
  term: 'deploy',

  nodes: {
    bootstrap: {
      id: 'bootstrap',
      desc: 'Setup project',
      produces: ['package.json', '.roadmap.json'],
      consumes: [],
      deps: [],
      validate: [{ type: 'artifact-exists', target: 'package.json' }],
      idempotent: true,
    },

    // Wait for Fusion build (blocking)
    fusion_ready: {
      id: 'fusion_ready',
      desc: 'Check: Fusion dist/ available',
      produces: ['vendor/fusion-dist.txt'],
      consumes: ['../fusion/dist/'],
      deps: ['bootstrap'],
      validate: [{ type: 'artifact-exists', target: 'vendor/fusion-dist.txt' }],
      idempotent: true,
    },

    // Can compile only after Fusion is ready
    compile: {
      id: 'compile',
      desc: 'TypeScript compilation (uses Fusion dist/)',
      produces: ['dist/'],
      consumes: ['../fusion/dist/', 'src/**/*.ts'],
      deps: ['fusion_ready'],
      validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
      idempotent: true,
    },

    test: {
      id: 'test',
      desc: 'Test with Fusion integration',
      produces: ['test-results.json'],
      consumes: ['dist/', '../fusion/dist/'],
      deps: ['compile'],
      validate: [{ type: 'artifact-exists', target: 'test-results.json' }],
      idempotent: true,
    },

    deploy: {
      id: 'deploy',
      desc: 'Deploy to control plane',
      produces: ['deployed.txt'],
      consumes: ['dist/', 'test-results.json'],
      deps: ['test'],
      validate: [{ type: 'artifact-exists', target: 'deployed.txt' }],
      idempotent: false,
    },
  },
};

test('cockpit: roadmap is valid', () => {
  const g = define(cockpitRoadmap);
  expect(g.id).toBe('cockpit-project');
});

test('cockpit: depends on fusion (cross-repo)', () => {
  const g = define(cockpitRoadmap);
  const fusionReady = g.nodes.fusion_ready;

  // Should consume from sibling repo
  expect(fusionReady.consumes).toContain('../fusion/dist/');
});

test('cockpit: compile cannot run until fusion_ready', () => {
  const g = define(cockpitRoadmap);
  const compile = g.nodes.compile;

  // fusion_ready must be in deps
  expect(compile.deps).toContain('fusion_ready');
});

test('cockpit: parallel execution groups', () => {
  const g = define(cockpitRoadmap);
  const groups = parallelOrder(g);

  // Group 0: bootstrap (independent)
  expect(groups[0]).toContain('bootstrap');

  // Group 1: fusion_ready (depends on bootstrap)
  expect(groups[1]).toContain('fusion_ready');

  // Group 2: compile (depends on fusion_ready)
  expect(groups[2]).toContain('compile');

  // bootstrap, fusion_ready, compile are all sequential
  expect(groups[0][0]).toBe('bootstrap');
  expect(groups[1][0]).toBe('fusion_ready');
  expect(groups[2][0]).toBe('compile');
});

test('cockpit: .roadmap.json declares fusion dependency', async () => {
  const metadata = {
    projectType: 'typescript-monorepo',
    init: ['package.json'],
    term: ['dist/', 'deployed.txt'],
    buildCommand: 'npm run build',
    dependencies: [
      {
        repo: '../fusion',
        consumes: ['dist/'],
        phase: 'build',
        mustComplete: true,
      },
    ],
  };

  expect(metadata.dependencies[0].repo).toBe('../fusion');
  expect(metadata.dependencies[0].mustComplete).toBe(true);
});

test('cockpit: execution order with cross-repo', async () => {
  // Simulated execution timeline:
  // T=0: Regent spawns Fusion agents
  // T=1: Fusion compile → dist/
  // T=2: Cockpit bootstrap, wait for fusion_ready
  // T=3: Cockpit compile (now Fusion dist/ exists)
  // T=4: Cockpit test
  // T=5: Cockpit deploy

  const executionOrder = [
    'fusion:bootstrap',
    'cockpit:bootstrap', // parallel with fusion:bootstrap
    'fusion:compile',
    'cockpit:fusion_ready', // waits for fusion:compile
    'cockpit:compile', // now depends are satisfied
    'cockpit:test',
    'cockpit:deploy',
  ];

  expect(executionOrder[2]).toBe('fusion:compile');
  expect(executionOrder.indexOf('cockpit:fusion_ready')).toBeGreaterThan(
    executionOrder.indexOf('fusion:compile')
  );
});
