import { describe, it, expect } from 'vitest';
import { graph, define, validateBatch } from '../src/protocol.ts';

describe('validateBatch: batch-level validation', () => {
  it('validates single-node batch with all artifacts present', async () => {
    const g = define(graph({
      id: 'simple',
      desc: 'init → work → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [] },
        work: { id: 'work', desc: 'work', produces: ['work.txt'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'] },
      },
    }));

    const batch = ['init'];
    const exists = (a: string) => a === 'init.txt';
    
    const result = await validateBatch(g, batch, exists);
    
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].passed).toBe(true);
    expect(result.missingArtifacts).toHaveLength(0);
  });

  it('fails single-node batch when artifact is missing', async () => {
    const g = define(graph({
      id: 'simple',
      desc: 'init → work → term',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [] },
        work: { id: 'work', desc: 'work', produces: ['work.txt'], consumes: [], deps: ['init'] },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['work'] },
      },
    }));

    const batch = ['init'];
    const exists = () => false; // No artifacts exist
    
    const result = await validateBatch(g, batch, exists);
    
    expect(result.passed).toBe(false);
    expect(result.missingArtifacts).toContain('init.txt');
  });

  it('validates multi-node batch (parallel nodes)', async () => {
    const g = define(graph({
      id: 'diamond',
      desc: 'root → [a,b] → c → term',
      init: 'root',
      term: 'term',
      nodes: {
        root: { id: 'root', desc: 'start', produces: ['root.txt'], consumes: [], deps: [] },
        a: { id: 'a', desc: 'work-a', produces: ['a.txt'], consumes: [], deps: ['root'] },
        b: { id: 'b', desc: 'work-b', produces: ['b.txt'], consumes: [], deps: ['root'] },
        c: { id: 'c', desc: 'merge', produces: ['c.txt'], consumes: [], deps: ['a', 'b'] },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
      },
    }));

    const batch = ['a', 'b']; // parallel nodes
    const exists = (a: string) => a === 'a.txt' || a === 'b.txt' || a === 'root.txt';
    
    const result = await validateBatch(g, batch, exists);
    
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every(r => r.passed)).toBe(true);
    expect(result.missingArtifacts).toHaveLength(0);
  });

  it('fails multi-node batch when one node is missing artifacts', async () => {
    const g = define(graph({
      id: 'diamond',
      desc: 'root → [a,b] → c → term',
      init: 'root',
      term: 'term',
      nodes: {
        root: { id: 'root', desc: 'start', produces: ['root.txt'], consumes: [], deps: [] },
        a: { id: 'a', desc: 'work-a', produces: ['a.txt'], consumes: [], deps: ['root'] },
        b: { id: 'b', desc: 'work-b', produces: ['b.txt'], consumes: [], deps: ['root'] },
        c: { id: 'c', desc: 'merge', produces: ['c.txt'], consumes: [], deps: ['a', 'b'] },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['c'] },
      },
    }));

    const batch = ['a', 'b'];
    const exists = (a: string) => a === 'a.txt' || a === 'root.txt'; // b.txt missing
    
    const result = await validateBatch(g, batch, exists);
    
    expect(result.passed).toBe(false);
    expect(result.missingArtifacts).toContain('b.txt');
  });

  it('passes batch with empty-produces nodes (gates)', async () => {
    const g = define(graph({
      id: 'gates',
      desc: 'work → [gate1, gate2] → term',
      init: 'work',
      term: 'term',
      nodes: {
        work: { id: 'work', desc: 'work', produces: ['output'], consumes: [], deps: [] },
        gate1: { id: 'gate1', desc: 'gate1', produces: [], consumes: [], deps: ['work'] },
        gate2: { id: 'gate2', desc: 'gate2', produces: [], consumes: [], deps: ['work'] },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['gate1', 'gate2'] },
      },
    }));

    const batch = ['gate1', 'gate2']; // gates with empty produces
    const exists = (a: string) => a === 'output';
    
    const result = await validateBatch(g, batch, exists);
    
    expect(result.passed).toBe(true);
    expect(result.missingArtifacts).toHaveLength(0); // Empty produces means no artifacts required
  });
});
