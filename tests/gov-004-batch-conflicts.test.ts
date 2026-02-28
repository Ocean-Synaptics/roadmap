import { describe, it, expect } from 'vitest';
import { define, batchConflicts } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

describe('FR-GOV-004: batchConflicts enforcement', () => {
  it('detects produces-overlap within a batch', () => {
    const g: Graph<string> = define({
      id: 'conflict-test',
      desc: 'two nodes produce same file',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed.txt'], consumes: [], deps: [], validate: [] },
        a: { id: 'a', desc: 'writer A', produces: ['foo.txt'], consumes: ['seed.txt'], deps: ['init'], validate: [] },
        b: { id: 'b', desc: 'writer B', produces: ['foo.txt'], consumes: ['seed.txt'], deps: ['init'], validate: [] },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['foo.txt'], deps: ['a', 'b'], validate: [] },
      },
    });

    const conflicts = batchConflicts(g);
    expect(conflicts.length).toBeGreaterThan(0);

    const overlap = conflicts.find(c => c.type === 'produces-overlap');
    expect(overlap).toBeDefined();
    expect(overlap!.file).toBe('foo.txt');
    expect(overlap!.writers).toContain('a');
    expect(overlap!.writers).toContain('b');
  });

  it('detects consumes-produces race within a batch', () => {
    const g: Graph<string> = define({
      id: 'race-test',
      desc: 'node reads what sibling writes',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed.txt'], consumes: [], deps: [], validate: [] },
        writer: { id: 'writer', desc: 'produces bar', produces: ['bar.txt'], consumes: ['seed.txt'], deps: ['init'], validate: [] },
        reader: { id: 'reader', desc: 'reads bar', produces: ['out.txt'], consumes: ['seed.txt', 'bar.txt'], deps: ['init'], validate: [] },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['bar.txt', 'out.txt'], deps: ['writer', 'reader'], validate: [] },
      },
    });

    const conflicts = batchConflicts(g);
    const race = conflicts.find(c => c.type === 'consumes-produces-race');
    expect(race).toBeDefined();
    expect(race!.file).toBe('bar.txt');
    expect(race!.writers).toContain('writer');
    expect(race!.writers).toContain('reader');
  });

  it('no conflicts in clean DAG', () => {
    const g: Graph<string> = define({
      id: 'clean-test',
      desc: 'no overlaps',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['seed.txt'], consumes: [], deps: [], validate: [] },
        a: { id: 'a', desc: 'writer A', produces: ['a.txt'], consumes: ['seed.txt'], deps: ['init'], validate: [] },
        b: { id: 'b', desc: 'writer B', produces: ['b.txt'], consumes: ['seed.txt'], deps: ['init'], validate: [] },
        term: { id: 'term', desc: 'end', produces: [], consumes: ['a.txt', 'b.txt'], deps: ['a', 'b'], validate: [] },
      },
    });

    const conflicts = batchConflicts(g);
    expect(conflicts).toEqual([]);
  });
});
