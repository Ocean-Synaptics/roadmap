import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

// Expand workflow-guide (opp-003: workflow hints enforcement)
if (nodes['workflow-guide']) {
  const parentDeps = nodes['workflow-guide'].deps;
  const newNodes: Record<string, any> = {
    'wg-design': {
      id: 'wg-design',
      desc: 'Design hint rendering strategy + placement',
      produces: ['.roadmap/cli-quality/wg-design.md'],
      consumes: [],
      deps: parentDeps,
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/wg-design.md' }],
      expandedFrom: 'workflow-guide'
    },
    'wg-implement': {
      id: 'wg-implement',
      desc: 'Implement Next Step block + re-orient pattern detection',
      produces: ['bin/roadmap.ts'],
      consumes: ['.roadmap/cli-quality/wg-design.md'],
      deps: ['wg-design'],
      validate: [{ type: 'shell', cmd: 'bin/roadmap orient --note x 2>/dev/null | grep -q "Next step"' }],
      expandedFrom: 'workflow-guide'
    },
    'wg-test': {
      id: 'wg-test',
      desc: 'Test hint effectiveness + A/B variants',
      produces: ['tests/cli/wg-test.ts'],
      consumes: [],
      deps: ['wg-implement'],
      validate: [{ type: 'shell', cmd: 'npm test -- wg-test.ts 2>&1 | grep -q pass' }],
      expandedFrom: 'workflow-guide'
    },
    'wg-mine': {
      id: 'wg-mine',
      desc: 'Mine abandon rate < 60%',
      produces: ['.roadmap/cli-quality/wg-mine.json'],
      consumes: [],
      deps: ['wg-test'],
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/wg-mine.json' }],
      expandedFrom: 'workflow-guide'
    }
  };
  Object.assign(nodes, newNodes);
  nodes['workflow-guide'].deps = ['wg-mine'];
  console.log('✅ Expanded workflow-guide');
}

// Expand help-improvements (opp-001: parallel features discoverability)
if (nodes['help-improvements']) {
  const parentDeps = nodes['help-improvements'].deps;
  const newNodes: Record<string, any> = {
    'hi-design': {
      id: 'hi-design',
      desc: 'Design help examples for --assign, --next, --ready',
      produces: ['.roadmap/cli-quality/hi-design.md'],
      consumes: [],
      deps: parentDeps,
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/hi-design.md' }],
      expandedFrom: 'help-improvements'
    },
    'hi-implement': {
      id: 'hi-implement',
      desc: 'Implement swarm dispatch examples in help',
      produces: ['bin/roadmap.ts'],
      consumes: ['.roadmap/cli-quality/hi-design.md'],
      deps: ['hi-design'],
      validate: [{ type: 'shell', cmd: 'bin/roadmap help 2>&1 | grep -q assign' }],
      expandedFrom: 'help-improvements'
    },
    'hi-test': {
      id: 'hi-test',
      desc: 'Test 3-agent swarm dispatch',
      produces: ['tests/cli/hi-test.ts'],
      consumes: [],
      deps: ['hi-implement'],
      validate: [{ type: 'shell', cmd: 'npm test -- hi-test.ts 2>&1 | grep -q pass' }],
      expandedFrom: 'help-improvements'
    },
    'hi-mine': {
      id: 'hi-mine',
      desc: 'Mine --assign adoption >= 20%',
      produces: ['.roadmap/cli-quality/hi-mine.json'],
      consumes: [],
      deps: ['hi-test'],
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/hi-mine.json' }],
      expandedFrom: 'help-improvements'
    }
  };
  Object.assign(nodes, newNodes);
  nodes['help-improvements'].deps = ['hi-mine'];
  console.log('✅ Expanded help-improvements');
}

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✅ Expand complete: 14 nodes → 22 nodes (Phase 1 batches)');
