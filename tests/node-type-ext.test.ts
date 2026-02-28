import { describe, it, expect } from 'vitest';
import { define } from '../src/protocol.ts';

// Minimal 2-node DAG factory with optional field overrides on the init node.
function minimalDag(initOverrides: Record<string, unknown> = {}) {
  return {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true, ...initOverrides },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: false },
    },
  } as Parameters<typeof define>[0];
}

describe('NodeSpec track/affects fields', () => {
  it('accepts node with track field', () => {
    expect(() => define(minimalDag({ track: 0 }))).not.toThrow();
  });

  it('accepts node with affects field', () => {
    expect(() => define(minimalDag({ affects: ['src/auth.ts', 'src/db.ts'] }))).not.toThrow();
  });

  it('accepts node with both track and affects', () => {
    expect(() => define(minimalDag({ track: 2, affects: ['src/perf.ts'] }))).not.toThrow();
  });

  it('backwards compatible — nodes without track/affects still valid', () => {
    expect(() => define(minimalDag())).not.toThrow();
  });

  it('rejects negative track', () => {
    expect(() => define(minimalDag({ track: -1 }))).toThrow(/track must be a non-negative integer/);
  });

  it('rejects non-integer track (float)', () => {
    expect(() => define(minimalDag({ track: 1.5 }))).toThrow(/track must be a non-negative integer/);
  });

  it('rejects affects with an empty string entry', () => {
    expect(() => define(minimalDag({ affects: ['src/valid.ts', ''] }))).toThrow(/affects entries must be non-empty strings/);
  });

  it('rejects non-array affects', () => {
    expect(() => define(minimalDag({ affects: 'src/auth.ts' as unknown as string[] }))).toThrow(/affects must be an array/);
  });
});
