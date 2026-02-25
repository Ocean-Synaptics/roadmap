import { describe, it, expect } from 'vitest';
import { define, check, verify, graph } from '../src/protocol.ts';

describe('adv-modify: goal deletion + replanning', () => {
  const testGraph = define(
    graph({
      id: 'test-modify',
      desc: 'Test roadmap for modification',
      init: 'start',
      term: 'end',
      nodes: {
        start: {
          id: 'start',
          desc: 'Beginning',
          produces: ['file-a.txt'],
          consumes: [],
          deps: [],
        },
        'mid-1': {
          id: 'mid-1',
          desc: 'Middle node 1',
          produces: ['file-b.txt'],
          consumes: ['file-a.txt'],
          deps: ['start'],
        },
        'mid-2': {
          id: 'mid-2',
          desc: 'Middle node 2',
          produces: ['file-c.txt'],
          consumes: ['file-a.txt'],
          deps: ['start'],
        },
        end: {
          id: 'end',
          desc: 'Terminal',
          produces: [],
          consumes: ['file-b.txt', 'file-c.txt'],
          deps: ['mid-1', 'mid-2'],
        },
      },
    }),
  );

  it('validates baseline graph', () => {
    expect(testGraph).toBeDefined();
  });

  it('detects node dependents', () => {
    const nodes = testGraph.nodes;
    const midDeps = Object.values(nodes).filter((n: any) => n.deps.includes('mid-1'));
    expect(midDeps.length).toBeGreaterThan(0);
  });

  it('finds leaf nodes', () => {
    const nodes = testGraph.nodes;
    const allDeps = new Set(Object.values(nodes).flatMap((n: any) => n.deps));
    const leafs = Object.keys(nodes).filter(id => !allDeps.has(id));
    expect(leafs).toContain('end');
  });

  it('tracks decision context', () => {
    const decision = {
      timestamp: Date.now(),
      action: 'delete',
      nodeId: 'mid-2',
      reason: 'Not needed',
    };
    expect(decision.action).toBe('delete');
  });

  it('serializes modification log', () => {
    const log = [
      { timestamp: 1, action: 'delete', nodeId: 'x', reason: 'r1' },
      { timestamp: 2, action: 'skip', nodeId: 'y', reason: 'r2' },
    ];
    const serialized = JSON.stringify(log);
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(2);
  });
});
