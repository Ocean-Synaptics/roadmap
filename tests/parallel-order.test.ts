import { describe, it, expect } from 'vitest';
import { parallelOrder, order, define, graph } from '../src/protocol.ts';

describe('parallelOrder', () => {
  it('returns single batch for linear chain', () => {
    const g = define(graph({
      id: 'linear', desc: 'test', init: 'a', term: 'c',
      nodes: {
        a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: '', produces: ['y'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: '', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    expect(batches).toEqual([['a'], ['b'], ['c']]);
  });

  it('groups independent nodes into same batch', () => {
    const g = define(graph({
      id: 'diamond', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: '', produces: ['y'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: '', produces: ['z'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: '', produces: [], consumes: [], deps: ['b', 'c'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    expect(batches).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('handles wide parallelism', () => {
    const g = define(graph({
      id: 'wide', desc: 'test', init: 'root', term: 'end',
      nodes: {
        root: { id: 'root', desc: '', produces: ['r'], consumes: [], deps: [], validate: [], idempotent: true },
        w1: { id: 'w1', desc: '', produces: ['a'], consumes: [], deps: ['root'], validate: [], idempotent: true },
        w2: { id: 'w2', desc: '', produces: ['b'], consumes: [], deps: ['root'], validate: [], idempotent: true },
        w3: { id: 'w3', desc: '', produces: ['c'], consumes: [], deps: ['root'], validate: [], idempotent: true },
        w4: { id: 'w4', desc: '', produces: ['d'], consumes: [], deps: ['root'], validate: [], idempotent: true },
        end: { id: 'end', desc: '', produces: [], consumes: [], deps: ['w1', 'w2', 'w3', 'w4'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    expect(batches).toEqual([['root'], ['w1', 'w2', 'w3', 'w4'], ['end']]);
  });

  it('preserves total order consistency', () => {
    const g = define(graph({
      id: 'complex', desc: 'test', init: 'a', term: 'f',
      nodes: {
        a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: '', produces: ['y'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: '', produces: ['z'], consumes: [], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: '', produces: ['w'], consumes: [], deps: ['b'], validate: [], idempotent: true },
        e: { id: 'e', desc: '', produces: ['v'], consumes: [], deps: ['c'], validate: [], idempotent: true },
        f: { id: 'f', desc: '', produces: [], consumes: [], deps: ['d', 'e'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    // a first, then b+c parallel, then d+e parallel, then f
    expect(batches).toEqual([['a'], ['b', 'c'], ['d', 'e'], ['f']]);

    // Flattened batches should be a valid topological order
    const flat = batches.flat();
    const topo = order(g);
    expect(flat.length).toBe(topo.length);
    // Every node in flat should appear in topo
    expect(new Set(flat)).toEqual(new Set(topo));
  });

  it('single node graph', () => {
    const g = define(graph({
      id: 'single', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    expect(batches).toEqual([['a'], ['b']]);
  });

  it('matches phase 13 structure: 4 parallel after gate', () => {
    // Models the actual phase 13 dependency graph
    const g = define(graph({
      id: 'phase13', desc: 'test', init: 'gate', term: 'done',
      nodes: {
        gate: { id: 'gate', desc: '', produces: ['g'], consumes: [], deps: [], validate: [], idempotent: true },
        docs: { id: 'docs', desc: '', produces: ['d'], consumes: [], deps: ['gate'], validate: [], idempotent: true },
        pred: { id: 'pred', desc: '', produces: ['p'], consumes: [], deps: ['gate'], validate: [], idempotent: true },
        par: { id: 'par', desc: '', produces: ['r'], consumes: [], deps: ['gate'], validate: [], idempotent: true },
        err: { id: 'err', desc: '', produces: ['e'], consumes: [], deps: ['gate'], validate: [], idempotent: true },
        cli: { id: 'cli', desc: '', produces: ['c'], consumes: [], deps: ['docs', 'pred', 'par', 'err'], validate: [], idempotent: true },
        done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['cli'], validate: [], idempotent: true },
      },
    }));

    const batches = parallelOrder(g);
    expect(batches).toEqual([
      ['gate'],
      ['docs', 'err', 'par', 'pred'], // all 4 independent — sorted alphabetically
      ['cli'],
      ['done'],
    ]);
  });
});
