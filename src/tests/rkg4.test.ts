// RKG-4 fixture DAGs + expected outputs
import { describe, it, expect } from 'vitest';
import { parallelOrder, orient, define, verify, check, graph, batchConflicts, CompletionStore } from '../protocol.ts';
import { bfsReachability, contractClosure } from '../lib/verify.ts';
import { detectBatchConflicts } from '../lib/batch-conflicts.ts';

// -- Helpers --

function mkNode(id: string, opts: Partial<{ produces: string[]; consumes: string[]; deps: string[]; mode: 'plan' | 'execute'; expandedFrom: string }> = {}) {
  return {
    id,
    desc: id,
    produces: opts.produces ?? [],
    consumes: opts.consumes ?? [],
    deps: opts.deps ?? [],
    validate: [] as any[],
    idempotent: true,
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(opts.expandedFrom ? { expandedFrom: opts.expandedFrom } : {}),
  };
}

// -- FR-DET-001: parallelOrder stability --

describe('RKG-4: parallelOrder stability (FR-DET-001)', () => {
  const g = define(graph({
    id: 'det-test', desc: 'determinism', init: 'init', term: 'term',
    nodes: {
      init: mkNode('init', { produces: ['x'] }),
      alpha: mkNode('alpha', { deps: ['init'], consumes: ['x'], produces: ['a'] }),
      beta: mkNode('beta', { deps: ['init'], consumes: ['x'], produces: ['b'] }),
      gamma: mkNode('gamma', { deps: ['alpha', 'beta'], consumes: ['a', 'b'], produces: ['c'] }),
      term: mkNode('term', { deps: ['gamma'], consumes: ['c'] }),
    } as any,
  }));

  it('same DAG produces same batch order across multiple calls', () => {
    const baseline = parallelOrder(g);
    for (let i = 0; i < 10; i++) {
      expect(parallelOrder(g)).toEqual(baseline);
    }
  });

  it('batch order is lexicographic within each batch', () => {
    const batches = parallelOrder(g);
    // alpha and beta are in the same batch (both depend only on init)
    const parallelBatch = batches.find(b => b.length > 1);
    expect(parallelBatch).toBeDefined();
    expect(parallelBatch).toEqual([...parallelBatch!].sort());
    // specifically: ['alpha', 'beta'] not ['beta', 'alpha']
    expect(parallelBatch![0]).toBe('alpha');
    expect(parallelBatch![1]).toBe('beta');
  });
});

// -- FR-REACH-001: BFS reachability witness --

describe('RKG-4: BFS reachability witness (FR-REACH-001)', () => {
  it('bfsReachability includes witness paths from init to each reachable node', () => {
    const g = define(graph({
      id: 'reach-test', desc: 'reach', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        mid: mkNode('mid', { deps: ['init'], produces: ['y'] }),
        term: mkNode('term', { deps: ['mid'] }),
      } as any,
    }));
    const result = bfsReachability(g);
    expect(result.unreachable).toEqual([]);
    expect(result.deadEnds).toEqual([]);
    // Witness path from init to mid
    const midPath = result.reachable.get('mid');
    expect(midPath).toBeDefined();
    expect(midPath![0]).toBe('init');
    expect(midPath![midPath!.length - 1]).toBe('mid');
    // init witness is just [init]
    expect(result.reachable.get('init')).toEqual(['init']);
  });

  it('unreachable node is detected', () => {
    // Build a DAG with an isolated node by adding it as a key but with no deps connecting it
    const nodes: Record<string, any> = {
      init: mkNode('init', { produces: ['x'] }),
      connected: mkNode('connected', { deps: ['init'], produces: ['y'] }),
      term: mkNode('term', { deps: ['connected'] }),
      orphan: mkNode('orphan', { produces: ['z'] }), // no deps to it, no dep from it
    };
    // define() would reject if orphan has no path, but bfsReachability is called pre-define on raw graph
    const g = { id: 'orphan-test', desc: 'orphan', init: 'init', term: 'term', nodes } as any;
    const result = bfsReachability(g);
    expect(result.unreachable).toContain('orphan');
  });

  it('dead-end node (reachable from init but cannot reach term) is detected', () => {
    const nodes: Record<string, any> = {
      init: mkNode('init', { produces: ['x'] }),
      spur: mkNode('spur', { deps: ['init'], produces: ['y'] }),
      main: mkNode('main', { deps: ['init'], produces: ['z'] }),
      term: mkNode('term', { deps: ['main'] }),
    };
    const g = { id: 'deadend-test', desc: 'deadend', init: 'init', term: 'term', nodes } as any;
    const result = bfsReachability(g);
    expect(result.unreachable).toEqual([]);
    expect(result.deadEnds).toContain('spur');
  });
});

// -- FR-CONTRACT-001: contract closure violations --

describe('RKG-4: contract closure violations (FR-CONTRACT-001)', () => {
  it('contractClosure detects ancestor closure gap — node consumes artifact not produced by any ancestor', () => {
    const g = define(graph({
      id: 'contract-test', desc: 'contract', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        mid: mkNode('mid', { deps: ['init'], consumes: ['x', 'missing.ts'], produces: ['y'] }),
        term: mkNode('term', { deps: ['mid'], consumes: ['y'] }),
      } as any,
    }));
    const violations = contractClosure(g);
    expect(violations.length).toBeGreaterThan(0);
    const v = violations.find(v => v.missingArtifact === 'missing.ts');
    expect(v).toBeDefined();
    expect(v!.nodeId).toBe('mid');
    expect(v!.witnessPath).toContain('init');
    expect(v!.witnessPath).toContain('mid');
  });

  it('verify() also reports unsatisfied contracts as string errors', () => {
    const g = define(graph({
      id: 'verify-test', desc: 'verify', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        bad: mkNode('bad', { deps: ['init'], consumes: ['nonexistent'], produces: ['y'] }),
        term: mkNode('term', { deps: ['bad'], consumes: ['y'] }),
      } as any,
    }));
    const errors = verify(g);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('nonexistent');
  });
});

// -- FR-BATCH-001: batch conflict detection --

describe('RKG-4: batch conflict detection (FR-BATCH-001)', () => {
  it('two nodes in same batch producing same path triggers conflict (detectBatchConflicts)', () => {
    const conflicts = detectBatchConflicts([
      { nodeId: 'a', produces: ['shared.ts', 'other.ts'] },
      { nodeId: 'b', produces: ['shared.ts', 'unique.ts'] },
    ]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].file).toBe('shared.ts');
    expect(conflicts[0].writers).toContain('a');
    expect(conflicts[0].writers).toContain('b');
    expect(conflicts[0].type).toBe('produces-overlap');
  });

  it('batchConflicts() on graph detects produces-overlap in parallel batch', () => {
    const g = define(graph({
      id: 'bc-test', desc: 'bc', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        w1: mkNode('w1', { deps: ['init'], produces: ['shared.ts'] }),
        w2: mkNode('w2', { deps: ['init'], produces: ['shared.ts'] }),
        term: mkNode('term', { deps: ['w1', 'w2'] }),
      } as any,
    }));
    const conflicts = batchConflicts(g);
    const overlap = conflicts.find(c => c.type === 'produces-overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.file).toBe('shared.ts');
  });

  it('no conflicts when batch nodes produce disjoint files', () => {
    const conflicts = detectBatchConflicts([
      { nodeId: 'a', produces: ['a.ts'] },
      { nodeId: 'b', produces: ['b.ts'] },
    ]);
    expect(conflicts).toEqual([]);
  });
});

// -- FR-ORIENT-001: plan receipt in orient output --

describe('RKG-4: plan receipt in orient output (FR-ORIENT-001)', () => {
  it('orient() includes planReceipts field when plan nodes are in current batch', () => {
    const g = define(graph({
      id: 'plan-receipt-test', desc: 'plan receipt', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        research: mkNode('research', { deps: ['init'], mode: 'plan' }),
        impl: mkNode('impl', { deps: ['research'], produces: ['out.ts'] }),
        term: mkNode('term', { deps: ['impl'] }),
      } as any,
    }));
    // init is done (no produces to check beyond receipt), research is in batch
    const completion = CompletionStore.from(['init']);
    const o = orient(g, completion);
    expect(o.planReceipts).toBeDefined();
    expect(o.planReceipts!.length).toBe(1);
    expect(o.planReceipts![0].nodeId).toBe('research');
    expect(o.planReceipts![0].mode).toBe('plan');
  });

  it('orient() omits planReceipts when no plan nodes exist in batch', () => {
    const g = define(graph({
      id: 'no-plan-test', desc: 'no plan', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        work: mkNode('work', { deps: ['init'], produces: ['y'] }),
        term: mkNode('term', { deps: ['work'] }),
      } as any,
    }));
    const completion = CompletionStore.from(['init']);
    const o = orient(g, completion);
    expect(o.planReceipts).toBeUndefined();
  });

  it('planReceipt shows expandedChildren when expansion children exist', () => {
    const g = define(graph({
      id: 'expanded-receipt-test', desc: 'expanded', init: 'init', term: 'term',
      nodes: {
        init: mkNode('init', { produces: ['x'] }),
        plan: mkNode('plan', { deps: ['init'], mode: 'plan' }),
        'plan-child-0': mkNode('plan-child-0', { deps: ['init'], produces: ['a.ts'], expandedFrom: 'plan' }),
        impl: mkNode('impl', { deps: ['plan', 'plan-child-0'], produces: ['out.ts'] }),
        term: mkNode('term', { deps: ['impl'] }),
      } as any,
    }));
    const completion = CompletionStore.from(['init']);
    const o = orient(g, completion);
    // plan and plan-child-0 are in the same batch (both depend on init)
    const planReceipt = o.planReceipts?.find(r => r.nodeId === 'plan');
    expect(planReceipt).toBeDefined();
    expect(planReceipt!.expandedChildren).toContain('plan-child-0');
  });
});
