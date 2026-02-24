// Seed — this repo describes its own construction.
//
// Validate: tsc --noEmit
// Run:      node --experimental-strip-types roadmap.ts

import { define, check, graph } from './src/protocol.ts';

const roadmap = define(graph({
  id: 'roadmap-bootstrap',
  desc: 'DAG expansion protocol library — self-bootstrapping seed',
  init: 'init',
  term: 'term',
  nodes: {
    init: {
      id: 'init',
      desc: 'Empty repo with PROTOCOL.md and package.json',
      produces: ['PROTOCOL.md', 'package.json', 'tsconfig.json'],
      consumes: [],
      deps: [],
    },
    protocol: {
      id: 'protocol',
      desc: 'Single-file library: types, validation, cycle detection, reconciliation',
      produces: ['src/protocol.ts'],
      consumes: [],
      deps: ['init'],
    },
    skill: {
      id: 'skill',
      desc: 'SKILL.md — the expansion protocol as an agent-invocable skill',
      produces: ['SKILL.md'],
      consumes: [],
      deps: ['init'],
    },
    seed: {
      id: 'seed',
      desc: 'Self-referential roadmap.ts — the library describes its own construction',
      produces: ['roadmap.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['protocol'],
    },
    verify: {
      id: 'verify',
      desc: 'tsc --noEmit passes, check() returns done, protocol validates itself',
      produces: ['tests/protocol.test.ts'],
      consumes: ['src/protocol.ts', 'roadmap.ts', 'SKILL.md'],
      deps: ['protocol', 'seed', 'skill'],
    },
    term: {
      id: 'term',
      desc: 'Any agent can invoke the skill, any repo can define a roadmap.ts',
      produces: [],
      consumes: ['src/protocol.ts', 'roadmap.ts', 'SKILL.md'],
      deps: ['verify'],
    },
  },
}));

const result = check(roadmap);
if (!result.done) {
  console.error('Not reconciled:', result.orphans);
  process.exit(1);
}

export default roadmap;

// The project schema — import these to reference phases or artifacts anywhere in the codebase.
export type NodeId = keyof typeof roadmap.nodes;
export type Artifact = (typeof roadmap.nodes)[NodeId]['produces'][number];
