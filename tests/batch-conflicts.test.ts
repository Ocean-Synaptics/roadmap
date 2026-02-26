// Batch conflict detection tests
import { describe, it, expect } from 'vitest';
import { define, graph, batchConflicts } from '../src/protocol.ts';

describe('batchConflicts', () => {
  it('detects produces overlap in same batch', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'write-1', produces: ['shared.ts'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'write-2', produces: ['shared.ts'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['shared.ts'], deps: ['b', 'c'], validate: [], idempotent: false },
      },
    }));
    // b and c are in the same batch (both depend only on a), both produce shared.ts
    const conflicts = batchConflicts(g);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].type).toBe('produces-overlap');
    expect(conflicts[0].file).toBe('shared.ts');
    expect(conflicts[0].writers).toContain('b');
    expect(conflicts[0].writers).toContain('c');
  });

  it('detects consumes-produces race in same batch', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'producer', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'consumer', produces: ['z'], consumes: ['x', 'y'], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['z'], deps: ['b', 'c'], validate: [], idempotent: false },
      },
    }));
    // b produces 'y', c consumes 'y' — but both are in the same batch.
    // c might read y before b writes it.
    const conflicts = batchConflicts(g);
    const race = conflicts.find(c => c.type === 'consumes-produces-race');
    expect(race).toBeDefined();
    expect(race!.file).toBe('y');
  });

  it('returns empty for clean batches', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'write-1', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'write-2', produces: ['z'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['y', 'z'], deps: ['b', 'c'], validate: [], idempotent: false },
      },
    }));
    // b and c produce different files — no conflict
    expect(batchConflicts(g)).toEqual([]);
  });

  it('skips single-node batches', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'end', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: false },
      },
    }));
    expect(batchConflicts(g)).toEqual([]);
  });

  it('reports correct batch level', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'f',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'mid', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'w1', produces: ['shared'], consumes: ['y'], deps: ['b'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'w2', produces: ['shared'], consumes: ['y'], deps: ['b'], validate: [], idempotent: true },
        e: { id: 'e', desc: 'join', produces: ['z'], consumes: ['shared'], deps: ['c', 'd'], validate: [], idempotent: true },
        f: { id: 'f', desc: 'end', produces: [], consumes: ['z'], deps: ['e'], validate: [], idempotent: false },
      },
    }));
    const conflicts = batchConflicts(g);
    expect(conflicts.length).toBe(1);
    // a=L0, b=L1, c+d=L2, e=L3, f=L4 — conflict at L2
    expect(conflicts[0].level).toBe(2);
  });
});
