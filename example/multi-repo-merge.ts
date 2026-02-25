// Multi-repo coordination: merging roadmaps from independent projects
//
// Use case: Two teams have separate roadmaps (fusion, cockpit).
// They need to coordinate at a shared contract point (e.g., "API service ready").
// Solution: merge() their DAGs at the reconcile() join point.

import { define, check, verify, reconcile, merge, graph, type Graph } from '../src/protocol.ts';

// --- Example roadmaps ---

// Repo 1: fusion roadmap (database + API layer)
const fusionRoadmap = define(
  graph({
    id: 'fusion',
    desc: 'Backend: database initialization + API service',
    init: 'init',
    term: 'deployed',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start state',
        produces: ['db-schema.sql'],
        consumes: [],
        deps: [],
      },
      'schema-deploy': {
        id: 'schema-deploy',
        desc: 'Deploy database schema',
        produces: ['database-ready'],
        consumes: ['db-schema.sql'],
        deps: ['init'],
      },
      'api-service': {
        id: 'api-service',
        desc: 'Implement API service',
        produces: ['api-service-ready'],
        consumes: ['database-ready'],
        deps: ['schema-deploy'],
      },
      deployed: {
        id: 'deployed',
        desc: 'Fusion complete',
        produces: [],
        consumes: ['api-service-ready'],
        deps: ['api-service'],
      },
    },
  }),
);

// Repo 2: cockpit roadmap (frontend + client SDK)
const cockpitRoadmap = define(
  graph({
    id: 'cockpit',
    desc: 'Frontend: UI components + client SDK',
    init: 'init',
    term: 'deployed',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start state',
        produces: ['ui-framework.ts'],
        consumes: [],
        deps: [],
      },
      'ui-components': {
        id: 'ui-components',
        desc: 'Build UI components',
        produces: ['ui-ready'],
        consumes: ['ui-framework.ts'],
        deps: ['init'],
      },
      'client-sdk': {
        id: 'client-sdk',
        desc: 'Generate client SDK from API spec',
        produces: ['sdk-ready'],
        consumes: ['api-service-ready'], // <- DEPENDENCY on fusion
        deps: ['ui-components'],
      },
      deployed: {
        id: 'deployed',
        desc: 'Cockpit complete',
        produces: [],
        consumes: ['ui-ready', 'sdk-ready'],
        deps: ['client-sdk'],
      },
    },
  }),
);

// --- Merge strategy ---

/**
 * Merge two roadmaps at a reconcile() join point.
 *
 * Cockpit depends on 'api-service-ready' (produced by Fusion).
 * This is the connection point.
 */
export function mergeRoadmaps(): Graph<string> {
  // Analyze both frontiers to find the join point
  const fusionFrontier = reconcile(
    fusionRoadmap,
    ['schema-deploy'],
    ['api-service'],
  );

  const cockpitFrontier = reconcile(
    cockpitRoadmap,
    ['ui-components'],
    ['client-sdk'],
  );

  console.log('Fusion frontier:');
  console.log('  Connections:', fusionFrontier.connections);
  console.log('  Gaps:', fusionFrontier.gaps);

  console.log('\nCockpit frontier:');
  console.log('  Connections:', cockpitFrontier.connections);
  console.log('  Gaps:', cockpitFrontier.gaps);

  // Find the join point: Fusion produces 'api-service-ready', Cockpit consumes it
  const connections = [
    {
      g1Node: 'api-service',
      g2Node: 'client-sdk',
      artifact: 'api-service-ready',
    },
  ];

  // Merge the graphs
  try {
    const merged = merge(
      fusionRoadmap as any,
      cockpitRoadmap as any,
      connections as any,
      'init', // shared init
      'deployed', // shared term
    );

    console.log('\nMerged roadmap:');
    console.log('  Nodes:', Object.keys(merged.nodes).length);
    console.log('  Init:', merged.init);
    console.log('  Term:', merged.term);

    // Validate
    const status = check(merged);
    if (!status.done) {
      console.error('  ERROR: Merged graph not fully connected', status.orphans);
      return null as any;
    }

    const errors = verify(merged);
    if (errors.length) {
      console.error('  ERROR: Contract violations:', errors);
      return null as any;
    }

    console.log('  ✓ Valid (acyclic, connected, contracts satisfied)');
    return merged;
  } catch (e) {
    console.error('Merge failed:', e instanceof Error ? e.message : String(e));
    return null as any;
  }
}

// --- Execution pattern ---

/**
 * Once merged, agents can execute cooperatively:
 *
 * 1. Fusion agent: execute until 'api-service' complete (produces 'api-service-ready')
 * 2. Cockpit agent spawns: reads merged roadmap
 * 3. Cockpit orients: 'client-sdk' is unblocked (consumes are satisfied)
 * 4. Cockpit executes: implements SDK against Fusion's API
 * 5. Both reach 'deployed' terminal node
 *
 * The merge() result is the source of truth.
 * Both teams commit to shared roadmap.ts (or maintain separate + merge at runtime).
 */

// Example invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  const merged = mergeRoadmaps();
  if (merged) {
    console.log('\n✓ Multi-repo roadmap merged successfully');
  }
}
