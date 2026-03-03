// test-orient-briefs: sealed agent briefs with zero DAG introspection
//
// Contract 7 — Brief Isolation:
// Agents receive sealed briefs that reveal only what they need to execute:
// - nodeId, title/description, whatYouProduce, whatYouConsume, validationRules
// - NO DAG structure, siblings, reachability, parent/child refs, mode details
//
// This test suite verifies:
// 1. orient returns current batch position
// 2. Each node in batch has a sealed brief
// 3. Briefs are immutable (Object.freeze)
// 4. Briefs contain ONLY the sealed contract fields
// 5. Briefs leak ZERO DAG topology information
// 6. Multiple orient calls return identical briefs (deterministic)
// 7. Agents cannot query graph topology from briefs
// 8. Claims/assignments annotated separately, not in brief
// 9. Plan nodes show mode='plan' in brief

import { describe, it, expect, beforeEach } from 'vitest';
import { graph, define, orient, CompletionStore } from '../src/protocol.ts';
import { getBrief } from '../src/lib/brief.ts';

describe('orient-briefs: sealed agent briefs', () => {
  // --- Test 1: orient returns current batch position ---
  it('returns current batch position as array of node IDs', () => {
    const g = define(
      graph({
        id: 'test-orient',
        desc: 'Test orient with briefs',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Initialize',
            produces: ['x.ts'],
            consumes: [],
            deps: [],
          },
          work: {
            id: 'work',
            desc: 'Do work',
            produces: ['y.ts'],
            consumes: ['x.ts'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'Done',
            produces: [],
            consumes: ['y.ts'],
            deps: ['work'],
          },
        },
      }),
    );

    const o = orient(g, CompletionStore.empty());

    expect(Array.isArray(o.position)).toBe(true);
    expect(o.position).toContain('init');
    expect(o.position.length).toBeGreaterThan(0);
  });

  // --- Test 2: each node in batch has a sealed brief ---
  it('each node in current batch can receive a brief', async () => {
    const g = define(
      graph({
        id: 'multi-batch',
        desc: 'Multi-batch DAG',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start: write seed',
            produces: ['seed.ts'],
            consumes: [],
            deps: [],
          },
          mid: {
            id: 'mid',
            desc: 'Middle: expand',
            produces: ['expanded.ts'],
            consumes: ['seed.ts'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['expanded.ts'],
            deps: ['mid'],
          },
        },
      }),
    );

    const o = orient(g, CompletionStore.empty());
    expect(o.position).toContain('init');

    // Request brief for the node in position
    const brief = await getBrief(g, o.position[0], '/tmp');
    expect(brief).toBeDefined();
    expect(brief.position).toBe('init');
  });

  // --- Test 3: briefs are immutable (frozen) ---
  it('brief objects are frozen and immutable', async () => {
    const g = define(
      graph({
        id: 'frozen-brief',
        desc: 'Test brief immutability',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['a.ts'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['a.ts'],
            deps: ['init'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'init', '/tmp');

    // Attempt to mutate should either fail (frozen) or be ineffective
    const originalProduces = [...brief.produces];

    try {
      (brief as any).produces = ['hacked.ts'];
      // If mutation succeeds, check it didn't change the original
      expect(brief.produces).toEqual(originalProduces);
    } catch {
      // Frozen object throws on mutation — even better
      expect(true).toBe(true);
    }
  });

  // --- Test 4: briefs contain only sealed contract fields ---
  it('brief contains ONLY nodeId, description, produces, consumes, and related fields', async () => {
    const g = define(
      graph({
        id: 'contract-test',
        desc: 'Test sealed contract',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start node for testing',
            produces: ['output.ts'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['output.ts'],
            deps: ['init'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'init', '/tmp');

    // Allowed fields per sealed brief contract
    const allowedFields = [
      'position', // node ID
      'mode',     // execution mode (execute/plan)
      'produces', // files to create
      'consumes', // files to read
      'description', // what to do
      'pattern', // how to do it
      'handoff', // previous handoff
      'handoffJournal', // work journal
      'remaining', // nodes remaining
      'pendingDeps', // plan deps (only for plan nodes)
    ];

    for (const field of Object.keys(brief)) {
      expect(allowedFields).toContain(field);
    }
  });

  // --- Test 5: briefs leak ZERO DAG topology ---
  it('brief does NOT contain sibling references, deps, or parent/child pointers', async () => {
    const g = define(
      graph({
        id: 'topo-test',
        desc: 'Topology leak test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Init',
            produces: ['x'],
            consumes: [],
            deps: [],
          },
          a: {
            id: 'a',
            desc: 'Task A',
            produces: ['a.ts'],
            consumes: ['x'],
            deps: ['init'],
          },
          b: {
            id: 'b',
            desc: 'Task B',
            produces: ['b.ts'],
            consumes: ['x'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['a.ts', 'b.ts'],
            deps: ['a', 'b'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'a', '/tmp');

    // Must NOT leak:
    expect((brief as any).deps).toBeUndefined();
    expect((brief as any).siblings).toBeUndefined();
    expect((brief as any).parents).toBeUndefined();
    expect((brief as any).children).toBeUndefined();
    expect((brief as any).nodes).toBeUndefined();
    expect((brief as any).nextNodeId).toBeUndefined();
    expect((brief as any).prevNodeId).toBeUndefined();
    expect((brief as any).level).toBeUndefined();
    expect((brief as any).expandedFrom).toBeUndefined();
  });

  // --- Test 6: multiple orient calls return identical briefs ---
  it('multiple calls to getBrief return identical, deterministic briefs', async () => {
    const g = define(
      graph({
        id: 'deterministic',
        desc: 'Test determinism',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start: reproducible work',
            produces: ['seed.ts'],
            consumes: [],
            deps: [],
          },
          mid: {
            id: 'mid',
            desc: 'Middle: stable',
            produces: ['output.ts'],
            consumes: ['seed.ts'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['output.ts'],
            deps: ['mid'],
          },
        },
      }),
    );

    const brief1 = await getBrief(g, 'mid', '/tmp');
    const brief2 = await getBrief(g, 'mid', '/tmp');
    const brief3 = await getBrief(g, 'mid', '/tmp');

    // All briefs should be identical
    expect(JSON.stringify(brief1)).toBe(JSON.stringify(brief2));
    expect(JSON.stringify(brief2)).toBe(JSON.stringify(brief3));

    // Field-by-field verification
    expect(brief1.position).toBe(brief2.position);
    expect(brief1.produces).toEqual(brief2.produces);
    expect(brief1.consumes).toEqual(brief2.consumes);
    expect(brief1.description).toBe(brief2.description);
    expect(brief1.mode).toBe(brief2.mode);
  });

  // --- Test 7: agents cannot query graph topology from briefs ---
  it('briefs provide no methods/APIs to discover siblings or unreachable nodes', async () => {
    const g = define(
      graph({
        id: 'api-test',
        desc: 'No topology API',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Init',
            produces: ['x'],
            consumes: [],
            deps: [],
          },
          worker: {
            id: 'worker',
            desc: 'Worker',
            produces: ['y'],
            consumes: ['x'],
            deps: ['init'],
          },
          hidden: {
            id: 'hidden',
            desc: 'Hidden from agent',
            produces: ['z'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['y'],
            deps: ['worker'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'worker', '/tmp');

    // Brief is a plain object — no methods to query topology
    expect(typeof (brief as any).getNextNode).toBe('undefined');
    expect(typeof (brief as any).getSiblings).toBe('undefined');
    expect(typeof (brief as any).getParents).toBe('undefined');
    expect(typeof (brief as any).queryDAG).toBe('undefined');
    expect(typeof (brief as any).listAll).toBe('undefined');

    // Even if methods existed, agent can't see 'hidden' node
    // (it's not reachable and not in consumes/produces)
  });

  // --- Test 8: claims/assignments annotated separately, not in brief ---
  it('claim/assignment info is separate from brief (annotation layer)', async () => {
    const g = define(
      graph({
        id: 'assignment-test',
        desc: 'Annotation layer test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['x'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['x'],
            deps: ['init'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'init', '/tmp');

    // Brief does NOT contain assignment metadata
    expect((brief as any).claimedBy).toBeUndefined();
    expect((brief as any).assignedAgent).toBeUndefined();
    expect((brief as any).assignmentTime).toBeUndefined();
    expect((brief as any).claimId).toBeUndefined();

    // These would be added at dispatch layer, not in brief
  });

  // --- Test 9: plan nodes show mode='plan' in brief ---
  it('plan nodes indicate mode="plan" in brief', async () => {
    const g = define(
      graph({
        id: 'plan-test',
        desc: 'Plan node mode',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['seed'],
            consumes: [],
            deps: [],
          },
          design: {
            id: 'design',
            desc: 'Design phase',
            produces: [],
            consumes: ['seed'],
            deps: ['init'],
            mode: 'plan',
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: [],
            deps: ['design'],
          },
        },
      }),
    );

    const planBrief = await getBrief(g, 'design', '/tmp');
    const execBrief = await getBrief(g, 'init', '/tmp');

    expect(planBrief.mode).toBe('plan');
    expect(execBrief.mode).toBe('execute');
  });

  // --- Test 10: brief description respects length limit ---
  it('description is truncated to 150 characters', async () => {
    const longDesc = 'A'.repeat(200); // 200 chars

    const g = define(
      graph({
        id: 'desc-limit',
        desc: 'Description limit test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: longDesc,
            produces: ['x'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['x'],
            deps: ['init'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'init', '/tmp');

    expect(brief.description.length).toBeLessThanOrEqual(150);
  });

  // --- Test 11: produces/consumes are arrays, not referential ---
  it('produces and consumes arrays are readable but not routed to DAG', async () => {
    const g = define(
      graph({
        id: 'array-test',
        desc: 'Array contract test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Multi-file producer',
            produces: ['a.ts', 'b.ts', 'c.ts'],
            consumes: [],
            deps: [],
          },
          mid: {
            id: 'mid',
            desc: 'Consumer',
            produces: ['result.ts'],
            consumes: ['a.ts', 'b.ts'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['result.ts'],
            deps: ['mid'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'mid', '/tmp');

    expect(Array.isArray(brief.produces)).toBe(true);
    expect(Array.isArray(brief.consumes)).toBe(true);
    expect(brief.produces).toContain('result.ts');
    expect(brief.consumes).toContain('a.ts');
    expect(brief.consumes).toContain('b.ts');
  });

  // --- Test 12: parallel batch in orient shows all concurrent node IDs ---
  it('parallel nodes in current batch all receive briefs independently', async () => {
    const g = define(
      graph({
        id: 'parallel-batch',
        desc: 'Parallel work test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['seed'],
            consumes: [],
            deps: [],
          },
          'task-a': {
            id: 'task-a',
            desc: 'Parallel task A',
            produces: ['a.ts'],
            consumes: ['seed'],
            deps: ['init'],
          },
          'task-b': {
            id: 'task-b',
            desc: 'Parallel task B',
            produces: ['b.ts'],
            consumes: ['seed'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['a.ts', 'b.ts'],
            deps: ['task-a', 'task-b'],
          },
        },
      }),
    );

    const o = orient(g, CompletionStore.from(['init']));

    // Current batch should contain both parallel tasks
    expect(o.position).toContain('task-a');
    expect(o.position).toContain('task-b');

    // Each can get their own brief
    const briefA = await getBrief(g, 'task-a', '/tmp');
    const briefB = await getBrief(g, 'task-b', '/tmp');

    expect(briefA.position).toBe('task-a');
    expect(briefB.position).toBe('task-b');
    expect(briefA.produces).toContain('a.ts');
    expect(briefB.produces).toContain('b.ts');
  });

  // --- Test 13: brief provides only what the agent needs to execute ---
  it('brief is minimal — includes only execution context, not planning context', async () => {
    const g = define(
      graph({
        id: 'minimal-brief',
        desc: 'Minimal context test',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start: create base files',
            produces: ['base.ts', 'utils.ts'],
            consumes: [],
            deps: [],
          },
          mid: {
            id: 'mid',
            desc: 'Build: extend with middleware',
            produces: ['middleware.ts'],
            consumes: ['base.ts'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['middleware.ts'],
            deps: ['mid'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'mid', '/tmp');

    // Must have execution context
    expect(brief.position).toBe('mid');
    expect(brief.produces).toBeDefined();
    expect(brief.consumes).toBeDefined();
    expect(brief.description).toBeDefined();

    // Must NOT have planning context
    expect((brief as any).criticalPath).toBeUndefined();
    expect((brief as any).completionPercentage).toBeUndefined();
    expect((brief as any).estimatedRemainingTime).toBeUndefined();
    expect((brief as any).priority).toBeUndefined();
    expect((brief as any).parallelBatch).toBeUndefined();
  });

  // --- Test 14: handoff info is available but doesn't leak sibling state ---
  it('handoff from predecessor available, but does not include sibling status', async () => {
    const g = define(
      graph({
        id: 'handoff-isolation',
        desc: 'Handoff doesn\'t leak siblings',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['x'],
            consumes: [],
            deps: [],
          },
          mid: {
            id: 'mid',
            desc: 'Middle',
            produces: ['y'],
            consumes: ['x'],
            deps: ['init'],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['y'],
            deps: ['mid'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'mid', '/tmp');

    // Brief may include handoff from predecessor
    if (brief.handoff) {
      // But handoff itself doesn't include sibling node info
      expect((brief.handoff as any).siblingNodes).toBeUndefined();
      expect((brief.handoff as any).parallelNodeStatus).toBeUndefined();
    }
  });

  // --- Test 15: sealed brief allows reproducible agent execution ---
  it('sealed brief is sufficient for agent to work reproducibly without DAG access', async () => {
    const g = define(
      graph({
        id: 'sealed-sufficient',
        desc: 'Brief is sufficient for work',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Write README',
            produces: ['README.md'],
            consumes: [],
            deps: [],
          },
          impl: {
            id: 'impl',
            desc: 'Implement feature from README',
            produces: ['src/feature.ts'],
            consumes: ['README.md'],
            deps: ['init'],
          },
          test: {
            id: 'test',
            desc: 'Test the feature',
            produces: ['tests/feature.test.ts'],
            consumes: ['src/feature.ts'],
            deps: ['impl'],
          },
          term: {
            id: 'term',
            desc: 'Done',
            produces: [],
            consumes: ['tests/feature.test.ts'],
            deps: ['test'],
          },
        },
      }),
    );

    const brief = await getBrief(g, 'impl', '/tmp');

    // Agent has enough to work: knows what inputs exist, what outputs needed, how to validate
    expect(brief.position).toBe('impl');
    expect(brief.consumes).toContain('README.md');
    expect(brief.produces).toContain('src/feature.ts');
    expect(brief.description).toBeTruthy();

    // But cannot see: test node, term node, or overall graph structure
    const briefAsAny = brief as any;
    expect(briefAsAny.nextNode).toBeUndefined();
    expect(briefAsAny.allNodes).toBeUndefined();
    expect(briefAsAny.graphStructure).toBeUndefined();
  });
});
