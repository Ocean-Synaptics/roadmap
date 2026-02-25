/**
 * Example: Generated bootstrap roadmap for a consumer project
 *
 * This is what generate-bootstrap.ts produces for a minimal project.
 * Real project: src/index.ts + package.json → compile → dist/index.js + dist/index.d.ts
 */

import { define, graph } from '../src/protocol.ts';

export default define(graph({
  id: 'example-project',
  desc: 'Example consumer project roadmap',
  init: 'init',
  term: 'deployed',
  nodes: {
    init: {
      id: 'init',
      desc: 'Initial state: source files exist',
      produces: ['src/index.ts', 'package.json', 'tsconfig.json'],
      consumes: [],
      deps: [],
      validate: [
        { type: 'artifact-exists', target: 'src/index.ts' },
        { type: 'artifact-exists', target: 'package.json' },
      ],
      idempotent: true,
    },
    build: {
      id: 'build',
      desc: 'Compile TypeScript → JavaScript + types',
      produces: ['dist/index.js', 'dist/index.d.ts'],
      consumes: ['src/index.ts', 'package.json', 'tsconfig.json'],
      deps: ['init'],
      validate: [
        { type: 'artifact-exists', target: 'dist/index.js' },
        { type: 'artifact-exists', target: 'dist/index.d.ts' },
      ],
      idempotent: true,
    },
    deployed: {
      id: 'deployed',
      desc: 'Ready for npm publish',
      produces: [],
      consumes: [
        'src/index.ts',
        'package.json',
        'tsconfig.json',
        'dist/index.js',
        'dist/index.d.ts',
      ],
      deps: ['build'],
      validate: [],
      idempotent: false,
    },
  },
}));

export type NodeId = 'init' | 'build' | 'deployed';
export type Artifact = 'src/index.ts' | 'package.json' | 'tsconfig.json' | 'dist/index.js' | 'dist/index.d.ts';
