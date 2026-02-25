// example/simple-project-roadmap.ts
// Real consumer example: simple CLI project roadmap

import { define, graph, check, verify, orient } from 'roadmap/protocol';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

export const roadmap = define(graph({
  id: 'hello-cli',
  desc: 'Simple CLI: read input, process, output result',
  init: 'scaffolding',
  term: 'deployed',
  nodes: {
    scaffolding: {
      id: 'scaffolding',
      desc: 'Create project structure',
      produces: ['package.json', 'tsconfig.json', 'src/'],
      consumes: [],
      deps: [],
    },
    core: {
      id: 'core',
      desc: 'Implement core logic',
      produces: ['src/index.ts', 'src/process.ts'],
      consumes: ['package.json'],
      deps: ['scaffolding'],
    },
    cli: {
      id: 'cli',
      desc: 'CLI argument parsing',
      produces: ['src/cli.ts'],
      consumes: ['src/index.ts'],
      deps: ['core'],
    },
    tests: {
      id: 'tests',
      desc: 'Unit + integration tests',
      produces: ['tests/'],
      consumes: ['src/cli.ts', 'src/process.ts'],
      deps: ['cli'],
    },
    docs: {
      id: 'docs',
      desc: 'README and usage docs',
      produces: ['README.md'],
      consumes: ['src/cli.ts'],
      deps: ['cli'],
    },
    deployed: {
      id: 'deployed',
      desc: 'Published to npm',
      produces: [],
      consumes: ['tests/', 'README.md'],
      deps: ['tests', 'docs'],
    },
  },
}));

// Verify the roadmap is valid
console.log('Validation:');
console.log('  check:', check(roadmap).done ? 'PASS' : 'FAIL');
console.log('  verify:', verify(roadmap).length === 0 ? 'PASS' : 'FAIL');

// Find current position
const pos = orient(roadmap, (artifact) =>
  existsSync(join(projectRoot, artifact))
);

console.log('\nCurrent position:');
console.log('  node:', pos.position);
console.log('  to create:', pos.produces);
console.log('  done:', pos.done);
console.log('  remaining:', pos.remaining);
