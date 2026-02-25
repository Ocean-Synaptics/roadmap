// ADV-BRANCH — branch(g, from) extracts subgraph from node to term

import { describe, it, expect } from 'vitest';
import { graph, define, check, verify, branch } from '../src/protocol.ts';

describe('ADV-BRANCH: branch(g, from) extracts subgraph', () => {
  it('branches from a middle node to term', () => {
    const g = define(graph({
      id: 'linear', desc: '', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: '', produces: ['a.txt'], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: ['b.txt'], consumes: [], deps: ['a'] },
        c: { id: 'c', desc: '', produces: ['c.txt'], consumes: [], deps: ['b'] },
        d: { id: 'd', desc: '', produces: [],       consumes: [], deps: ['c'] },
      },
    }));

    const branched = branch(g, 'b');
    expect(branched.init).toBe('b');
    expect(branched.term).toBe('d');
    expect(Object.keys(branched.nodes).sort()).toEqual(['b', 'c', 'd'].sort());
  });

  it('branched graph passes check() and verify()', () => {
    const g = define(graph({
      id: 'test', desc: '', init: 'x', term: 'z',
      nodes: {
        x: { id: 'x', desc: '', produces: ['x.txt'], consumes: [], deps: [] },
        y: { id: 'y', desc: '', produces: ['y.txt'], consumes: [], deps: ['x'] },
        z: { id: 'z', desc: '', produces: [],       consumes: [], deps: ['y'] },
      },
    }));

    const branched = branch(g, 'y');
    expect(check(branched).done).toBe(true);
    expect(verify(branched)).toEqual([]);
  });

  it('branch from node before term includes all successors', () => {
    const g = define(graph({
      id: 'chain', desc: '', init: 'a', term: 'c',
      nodes: {
        a: { id: 'a', desc: '', produces: [], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'] },
        c: { id: 'c', desc: '', produces: [], consumes: [], deps: ['b'] },
      },
    }));

    const branched = branch(g, 'b');
    expect(branched.init).toBe('b');
    expect(Object.keys(branched.nodes).sort()).toEqual(['b', 'c'].sort());
  });

  it('branch throws on unsatisfied consumes', () => {
    const g = define(graph({
      id: 'consuming', desc: '', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: '', produces: ['a.txt'], consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: [],       consumes: ['a.txt'], deps: ['a'] },
        c: { id: 'c', desc: '', produces: ['c.txt'], consumes: [],       deps: ['b'] },
        d: { id: 'd', desc: '', produces: [],       consumes: [],       deps: ['c'] },
      },
    }));

    // Branch from 'b' — 'a.txt' is required but 'a' not included
    // branch() validates and throws on unsatisfied consume
    expect(() => branch(g, 'b')).toThrow(/Branch validation failed/);
  });

  it('branch with multiple nodes preserves topology', () => {
    const g = define(graph({
      id: 'diamond', desc: '', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: '', produces: ['a.txt'],       consumes: [], deps: [] },
        b: { id: 'b', desc: '', produces: ['b.txt'],       consumes: [],       deps: ['a'] },
        c: { id: 'c', desc: '', produces: ['c.txt'],       consumes: [],       deps: ['a'] },
        d: { id: 'd', desc: '', produces: [],              consumes: ['b.txt', 'c.txt'], deps: ['b', 'c'] },
      },
    }));

    const branched = branch(g, 'a');
    expect(Object.keys(branched.nodes).length).toBeGreaterThan(1);
    expect(check(branched).done).toBe(true);
  });
});
