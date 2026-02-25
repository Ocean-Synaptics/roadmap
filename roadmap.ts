// Adversarial hardening phase — cycle 2 from bootstrap-complete state.
//
// Two lanes:
//   Adversarial (spec-first): test files specifying correct behavior, may expose known bugs.
//   Constructive (fix-driven): protocol.ts fixes + decision docs satisfying adversarial specs.
//
// Reconcile point: adv-property → consumer-integration (forward produces meets backward consumes).
//
// Validate: tsc --noEmit
// Run:      node --experimental-strip-types roadmap.ts

import { define, check, verify, reconcile, graph } from './src/protocol.ts';

const roadmap = define(graph({
  id: 'roadmap-adversarial',
  desc: 'DAG expansion protocol — adversarial hardening: spec-first bugs, property tests, consumer validation',
  init: 'init',
  term: 'term',
  nodes: {
    init: {
      id: 'init',
      desc: 'Library core + seed tests + self-referential roadmap + expansion skill',
      produces: ['src/protocol.ts', 'tests/protocol.test.ts', 'roadmap.ts', 'SKILL.md'],
      consumes: [],
      deps: [],
    },

    // --- SESSION ENTRY GATE ---
    // reorient produces a gitignored receipt. Always missing at session start.
    // orient() positions here first. boot.ts creates the receipt after checks pass.
    // All pending work nodes depend on this — nothing executes without a valid boot.

    reorient: {
      id: 'reorient',
      desc: 'Session entry gate: run boot.ts, verify orientation, confirm position, choose mode',
      produces: ['.boot/session-receipt.json'],
      consumes: [],
      deps: ['adv-reconcile', 'adv-orient'],
    },

    // --- ADVERSARIAL LANE (spec-first) ---

    'adv-reconcile': {
      id: 'adv-reconcile',
      desc: 'Adversarial spec: reconcile gap.missing = unmet consumes only, not surplus produces',
      produces: ['tests/adv-reconcile.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-orient': {
      id: 'adv-orient',
      desc: 'Adversarial spec: orient empty-produces stalls permanently — specify correct behavior',
      produces: ['tests/adv-orient.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-property': {
      id: 'adv-property',
      desc: 'Property-based: for all valid graphs, order()→orient() consistent, check()→verify() agree',
      produces: ['tests/adv-property.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['reorient'],
    },
    'adv-types': {
      id: 'adv-types',
      desc: 'Type-level: invalid dep refs, id/key mismatch, unknown nodes are tsc errors',
      produces: ['tests/adv-types.test-d.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['reorient'],
    },

    // --- CONSTRUCTIVE LANE (fix-driven) ---

    'fix-reconcile': {
      id: 'fix-reconcile',
      desc: 'Fix reconcile gap: missing = bn.consumes.filter(c => !fn.produces.includes(c))',
      produces: ['docs/decisions/reconcile-gap.md'],
      consumes: ['src/protocol.ts', 'tests/adv-reconcile.test.ts'],
      deps: ['adv-reconcile', 'reorient'],
    },
    'fix-orient': {
      id: 'fix-orient',
      desc: 'Fix orient empty-produces: !node.produces.length || node.produces.every(exists)',
      produces: ['docs/decisions/orient-empty-produces.md'],
      consumes: ['src/protocol.ts', 'tests/adv-orient.test.ts'],
      deps: ['adv-orient', 'reorient'],
    },

    // --- CONSUMER VALIDATION ---

    'consumer-integration': {
      id: 'consumer-integration',
      desc: 'Consumer smoke test: install from path, write minimal roadmap.ts, orient() from real filesystem',
      produces: ['tests/consumer-integration.test.ts'],
      consumes: [
        'src/protocol.ts',
        'roadmap.ts',
        'SKILL.md',
        'tests/adv-property.test.ts',
        'docs/decisions/reconcile-gap.md',
        'docs/decisions/orient-empty-produces.md',
      ],
      deps: ['fix-reconcile', 'fix-orient', 'adv-property'],
    },

    'phase-1-term': {
      id: 'phase-1-term',
      desc: 'Phase 1 complete: adversarially hardened protocol core (bugs fixed, contracts proven)',
      produces: [],
      consumes: [
        'tests/adv-reconcile.test.ts',
        'tests/adv-orient.test.ts',
        'tests/adv-property.test.ts',
        'tests/adv-types.test-d.ts',
        'tests/consumer-integration.test.ts',
      ],
      deps: ['consumer-integration', 'adv-types'],
    },

    // --- PHASE 2: DAG merge operations ---

    'merge-spec': {
      id: 'merge-spec',
      desc: 'Spec: merge(g1, g2, connections) combines DAGs at reconcile() join points — init/term unification strategy',
      produces: ['docs/decisions/merge-design.md'],
      consumes: ['src/protocol.ts', 'docs/decisions/reconcile-gap.md'],
      deps: ['phase-1-term'],
    },

    'adv-merge': {
      id: 'adv-merge',
      desc: 'Adversarial spec: merge() preserves structure (no cycles), unifies nodes correctly, consumes satisfied',
      produces: ['tests/adv-merge.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-1-term'],
    },

    'merge-impl': {
      id: 'merge-impl',
      desc: 'Implement merge(g1, g2): validate inputs, reconcile(), add structural edges, define() + verify() merged graph',
      produces: ['src/protocol.ts'],
      consumes: ['tests/adv-merge.test.ts', 'docs/decisions/merge-design.md'],
      deps: ['adv-merge', 'merge-spec'],
    },

    'phase-2-term': {
      id: 'phase-2-term',
      desc: 'Phase 2 complete: DAG merge operations enable recursive expansion + multi-repo coordination',
      produces: [],
      consumes: ['tests/adv-merge.test.ts', 'docs/decisions/merge-design.md'],
      deps: ['merge-impl'],
    },

    // --- PHASE 3: Branch operations ---

    'branch-spec': {
      id: 'branch-spec',
      desc: 'Spec: branch(g, from) extracts subgraph from node to term, creates variant DAG for parallel development',
      produces: ['docs/decisions/branch-design.md'],
      consumes: ['src/protocol.ts', 'docs/decisions/merge-design.md'],
      deps: ['phase-2-term'],
    },

    'adv-branch': {
      id: 'adv-branch',
      desc: 'Adversarial spec: branch() preserves structure (acyclic), includes all reachable nodes to term, consumes satisfied',
      produces: ['tests/adv-branch.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['phase-2-term'],
    },

    'branch-impl': {
      id: 'branch-impl',
      desc: 'Implement branch(g, from): extract subgraph, set new init/term, validate via define() + verify()',
      produces: ['src/protocol.ts'],
      consumes: ['tests/adv-branch.test.ts', 'docs/decisions/branch-design.md'],
      deps: ['adv-branch', 'branch-spec'],
    },

    term: {
      id: 'term',
      desc: 'Complete: protocol core hardened + merge + branch operations, typed governance for multi-repo + parallel roadmaps',
      produces: [],
      consumes: ['tests/adv-branch.test.ts', 'docs/decisions/branch-design.md'],
      deps: ['branch-impl'],
    },
  },
}));

// --- Checks ---

const status = check(roadmap);
if (!status.done) {
  console.error('check: not reconciled', status.orphans);
  process.exit(1);
}

const errors = verify(roadmap);
if (errors.length) {
  console.error('verify:', errors);
  process.exit(1);
}

console.log('check: done');
console.log('verify: all contracts satisfied');

// --- Frontier reconciliation (show where adversarial meets constructive) ---

const { connections, gaps } = reconcile(
  roadmap,
  ['adv-reconcile', 'adv-orient', 'adv-property'],
  ['consumer-integration'],
);
console.log('reconcile: connections', connections.map(c => `${c.forward}→${c.backward} via ${c.artifact}`));
console.log('reconcile: gaps', gaps.map(g => `${g.between.join('↔')} missing ${g.missing.join(', ')}`));

export default roadmap;
export type NodeId = keyof typeof roadmap.nodes;
export type Artifact = (typeof roadmap.nodes)[NodeId]['produces'][number];
