/**
 * Simple Project Roadmap Example
 *
 * A minimal TypeScript project: scaffold → build → test → ready
 * Shows the core pattern for defining and working with DAGs.
 */

import { define, graph } from '../src/protocol.ts';

export const simpleProjectRoadmap = define(
  graph({
    id: 'simple-project',
    desc: 'TypeScript project: scaffold, build, test',
    version: '1.0.0',
    protocolVersion: '0.4.0',
    init: 'scaffold',
    term: 'ready',
    nodes: {
      /**
       * SCAFFOLD: Create initial project structure
       *
       * This is the init node. In a real project, it might already exist
       * or be created by a generator. It produces the foundational files
       * needed by all subsequent work.
       */
      scaffold: {
        id: 'scaffold',
        desc: 'Create project scaffold: source files, config',
        produces: [
          'src/main.ts',
          'src/utils.ts',
          'tsconfig.json',
          'package.json',
        ],
        consumes: [],
        deps: [],
        validate: [
          { type: 'artifact-exists', target: 'src/main.ts' },
          { type: 'artifact-exists', target: 'tsconfig.json' },
        ],
        idempotent: true,
      },

      /**
       * BUILD: Compile TypeScript to JavaScript
       *
       * Depends on scaffold's output. Produces compiled JavaScript.
       * All build artifacts go to dist/.
       */
      build: {
        id: 'build',
        desc: 'Compile TypeScript → JavaScript',
        produces: [
          'dist/main.js',
          'dist/utils.js',
        ],
        consumes: [
          'src/main.ts',
          'src/utils.ts',
          'tsconfig.json',
        ],
        deps: ['scaffold'],
        validate: [
          { type: 'artifact-exists', target: 'dist/main.js' },
        ],
        idempotent: true,
      },

      /**
       * TEST: Run test suite
       *
       * Independent of build; depends on scaffold source files.
       * Can run in parallel with build. Produces coverage report.
       */
      test: {
        id: 'test',
        desc: 'Run tests and generate coverage report',
        produces: [
          'coverage/report.html',
          'coverage/coverage.json',
        ],
        consumes: [
          'src/main.ts',
          'src/utils.ts',
        ],
        deps: ['scaffold'],
        validate: [
          { type: 'artifact-exists', target: 'coverage/report.html' },
        ],
        idempotent: true,
      },

      /**
       * READY: Terminal node
       *
       * Gate node (produces: []). Marks project as ready.
       * Depends on both build and test — ensures all work complete.
       * Terminal nodes are idempotent: false (one-time transition).
       */
      ready: {
        id: 'ready',
        desc: 'Project ready for release',
        produces: [],
        consumes: [
          'dist/main.js',
          'coverage/report.html',
        ],
        deps: [
          'build',
          'test',
        ],
        validate: [],
        idempotent: false,
      },
    },
  })
);

/**
 * Key insights from this example:
 *
 * 1. DAG STRUCTURE
 *    scaffold
 *    ├─ build → ready
 *    └─ test ─┘
 *
 * 2. PARALLELISM
 *    Build and test are independent — both depend on scaffold but not each other.
 *    They can run in parallel. See parallelOrder(g) for concurrent batches.
 *
 * 3. TERMINAL DEPENDENCY
 *    The terminal node "ready" depends on ALL prior work:
 *    - build (produces dist/main.js)
 *    - test (produces coverage/report.html)
 *
 * 4. GATE NODES
 *    "ready" produces no artifacts (produces: []).
 *    It's a gate/coordination node. Once all deps are satisfied, it's trivially done.
 *
 * 5. IDEMPOTENCE
 *    Early nodes (scaffold, build, test) are idempotent: true.
 *    Re-running them is safe; same input produces same output.
 *    Terminal node is idempotent: false (one-time event).
 *
 * 6. VALIDATE
 *    Each node declares post-execution checks.
 *    scaffold and build check file existence.
 *    test checks for coverage report.
 *    ready has no checks (its only job is to verify all deps complete).
 */
