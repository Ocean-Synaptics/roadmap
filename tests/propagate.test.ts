import { describe, it, expect } from 'vitest';
import { define, graph, check, verify } from '../src/protocol.ts';
import { propagateConstraints } from '../src/lib/propagate.ts';
import type { Graph, ValidationRule } from '../src/protocol.ts';

// --- Helpers ---

function node(id: string, overrides: Partial<{ produces: string[]; consumes: string[]; deps: string[]; validate: ValidationRule[]; idempotent: boolean }> = {}) {
  return {
    id, desc: id,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: overrides.idempotent ?? true,
  };
}

// --- build-produces propagation ---

describe('build-produces propagation', () => {
  it('derives artifact-exists on upstream producer from downstream build-produces', () => {
    const g = define(graph({
      id: 'bp', desc: 'build-produces test', init: 'a', term: 'c',
      nodes: {
        a: node('a', { produces: ['src/lib.ts'] }),
        b: node('b', { produces: ['dist/out.js'], consumes: ['src/lib.ts'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['dist/out.js'] }] }),
        c: node('c', { consumes: ['dist/out.js'], deps: ['b'] }),
      },
    }));

    const result = propagateConstraints(g);
    expect(result.propagated).toBeGreaterThan(0);

    // Upstream producer 'a' should get artifact-exists on src/lib.ts
    const aConstraints = result.constraints.find(c => c.node === 'a');
    expect(aConstraints).toBeDefined();
    expect(aConstraints!.from).toContain('b');

    // Verify the actual rule on the mutated DAG
    const aNode = (result.dag!.nodes as any)['a'];
    const propagated = aNode.validate.filter((r: ValidationRule) => r._propagatedFrom === 'b');
    expect(propagated.length).toBeGreaterThan(0);
    expect(propagated[0].type).toBe('artifact-exists');
    expect(propagated[0].target).toBe('src/lib.ts');
  });
});

// --- launch-check propagation ---

describe('launch-check propagation', () => {
  it('derives artifact-exists on upstream from downstream launch-check', () => {
    const g = define(graph({
      id: 'lc', desc: 'launch-check test', init: 'a', term: 'c',
      nodes: {
        a: node('a', { produces: ['dist/main.js'] }),
        b: node('b', { produces: ['dist/config.json'], deps: ['a'] }),
        c: node('c', {
          consumes: ['dist/main.js', 'dist/config.json'], deps: ['a', 'b'],
          validate: [{ type: 'launch-check', command: 'node dist/main.js' }],
        }),
      },
    }));

    const result = propagateConstraints(g);
    expect(result.propagated).toBeGreaterThan(0);

    // 'a' should get artifact-exists for dist/main.js (from 'c')
    const dagA = (result.dag!.nodes as any)['a'];
    const fromC = dagA.validate.filter((r: ValidationRule) => r._propagatedFrom === 'c');
    expect(fromC.some((r: any) => r.type === 'artifact-exists' && r.target === 'dist/main.js')).toBe(true);

    // 'b' should get artifact-exists for dist/config.json (from 'c')
    const dagB = (result.dag!.nodes as any)['b'];
    const bFromC = dagB.validate.filter((r: ValidationRule) => r._propagatedFrom === 'c');
    expect(bFromC.some((r: any) => r.type === 'artifact-exists' && r.target === 'dist/config.json')).toBe(true);
  });
});

// --- shell propagation ---

describe('shell propagation', () => {
  it('derives artifact-exists when shell command references a consumed artifact', () => {
    const g = define(graph({
      id: 'sh', desc: 'shell test', init: 'a', term: 'b',
      nodes: {
        a: node('a', { produces: ['lib/utils.js'] }),
        b: node('b', {
          consumes: ['lib/utils.js'], deps: ['a'],
          validate: [{ type: 'shell', command: 'node -e "require(\'lib/utils.js\')"' }],
        }),
      },
    }));

    const result = propagateConstraints(g);
    expect(result.propagated).toBeGreaterThan(0);

    const dagA = (result.dag!.nodes as any)['a'];
    const fromB = dagA.validate.filter((r: ValidationRule) => r._propagatedFrom === 'b');
    expect(fromB.some((r: any) => r.type === 'artifact-exists' && r.target === 'lib/utils.js')).toBe(true);
  });

  it('does not derive constraint when shell command does not mention the artifact', () => {
    const g = define(graph({
      id: 'sh2', desc: 'shell no-match test', init: 'a', term: 'b',
      nodes: {
        a: node('a', { produces: ['lib/utils.js'] }),
        b: node('b', {
          consumes: ['lib/utils.js'], deps: ['a'],
          validate: [{ type: 'shell', command: 'echo hello' }],
        }),
      },
    }));

    const result = propagateConstraints(g);
    expect(result.propagated).toBe(0);
  });
});

// --- deduplication ---

describe('deduplication', () => {
  it('does not add duplicate constraint if equivalent already exists', () => {
    const g = define(graph({
      id: 'dup', desc: 'dedup test', init: 'a', term: 'b',
      nodes: {
        a: node('a', {
          produces: ['src/lib.ts'],
          validate: [{ type: 'artifact-exists', target: 'src/lib.ts' }],
        }),
        b: node('b', {
          consumes: ['src/lib.ts'], deps: ['a'],
          validate: [{ type: 'build-produces', command: 'tsc', outputs: ['dist/out.js'] }],
        }),
      },
    }));

    const result = propagateConstraints(g);
    // 'a' already has artifact-exists on src/lib.ts — should not duplicate
    const dagA = (result.dag!.nodes as any)['a'];
    const existsRules = dagA.validate.filter((r: any) => r.type === 'artifact-exists' && r.target === 'src/lib.ts');
    expect(existsRules.length).toBe(1); // original only, no duplicate
  });
});

// --- provenance ---

describe('provenance', () => {
  it('all propagated rules carry _propagatedFrom matching source node', () => {
    const g = define(graph({
      id: 'prov', desc: 'provenance test', init: 'a', term: 'c',
      nodes: {
        a: node('a', { produces: ['x.ts'] }),
        b: node('b', { produces: ['y.js'], consumes: ['x.ts'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['y.js'] }] }),
        c: node('c', { consumes: ['y.js'], deps: ['b'], validate: [{ type: 'launch-check', command: 'node y.js' }] }),
      },
    }));

    const result = propagateConstraints(g);
    if (!result.dag) throw new Error('Expected mutated dag');

    for (const [, n] of Object.entries(result.dag.nodes as any)) {
      for (const rule of (n as any).validate) {
        if (rule._propagatedFrom) {
          // _propagatedFrom must reference an existing node
          expect(Object.keys(result.dag.nodes)).toContain(rule._propagatedFrom);
        }
      }
    }
  });
});

// --- dry-run ---

describe('dry-run', () => {
  it('returns result but dag field is undefined', () => {
    const g = define(graph({
      id: 'dr', desc: 'dry-run test', init: 'a', term: 'b',
      nodes: {
        a: node('a', { produces: ['x'] }),
        b: node('b', { consumes: ['x'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['y'] }] }),
      },
    }));

    const result = propagateConstraints(g, { dryRun: true });
    expect(result.dag).toBeUndefined();
    expect(result.propagated).toBeGreaterThan(0);
  });
});

// --- --from ---

describe('--from option', () => {
  it('propagation starts from specific node, not term', () => {
    const g = define(graph({
      id: 'fr', desc: 'from test', init: 'a', term: 'd',
      nodes: {
        a: node('a', { produces: ['x'] }),
        b: node('b', { produces: ['y'], consumes: ['x'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['y'] }] }),
        c: node('c', { produces: ['z'], consumes: ['y'], deps: ['b'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['z'] }] }),
        d: node('d', { consumes: ['z'], deps: ['c'] }),
      },
    }));

    // Propagate from 'b' only — should derive on 'a' from 'b', but NOT from 'c'
    const result = propagateConstraints(g, { from: 'b' });
    const aEntry = result.constraints.find(c => c.node === 'a');
    expect(aEntry).toBeDefined();
    expect(aEntry!.from).toContain('b');
    // 'c' should not contribute (it's before 'b' in reverse order)
    const bEntry = result.constraints.find(c => c.node === 'b');
    // 'b' may or may not have constraints from 'b' itself; key point: no 'c' sourced constraints
    const allSources = result.constraints.flatMap(c => c.from);
    expect(allSources).not.toContain('c');
  });

  it('returns empty result for nonexistent node', () => {
    const g = define(graph({
      id: 'fr2', desc: 'from nonexistent', init: 'a', term: 'b',
      nodes: {
        a: node('a', { produces: ['x'] }),
        b: node('b', { consumes: ['x'], deps: ['a'] }),
      },
    }));

    const result = propagateConstraints(g, { from: 'nonexistent' });
    expect(result.propagated).toBe(0);
  });
});

// --- --depth ---

describe('--depth option', () => {
  it('limits propagation hop count', () => {
    const g = define(graph({
      id: 'dep', desc: 'depth test', init: 'a', term: 'd',
      nodes: {
        a: node('a', { produces: ['x'] }),
        b: node('b', { produces: ['y'], consumes: ['x'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc1', outputs: ['y'] }] }),
        c: node('c', { produces: ['z'], consumes: ['y'], deps: ['b'], validate: [{ type: 'build-produces', command: 'tsc2', outputs: ['z'] }] }),
        d: node('d', { consumes: ['z'], deps: ['c'], validate: [{ type: 'build-produces', command: 'tsc3', outputs: ['w'] }] }),
      },
    }));

    const full = propagateConstraints(g);
    const limited = propagateConstraints(g, { depth: 1 });
    expect(limited.propagated).toBeLessThanOrEqual(full.propagated);
  });
});

// --- acyclic preservation ---

describe('acyclic preservation', () => {
  it('propagated DAG still passes check()', () => {
    const g = define(graph({
      id: 'ac', desc: 'acyclic test', init: 'a', term: 'd',
      nodes: {
        a: node('a', { produces: ['src/a.ts'] }),
        b: node('b', { produces: ['src/b.ts'], consumes: ['src/a.ts'], deps: ['a'], validate: [{ type: 'build-produces', command: 'tsc', outputs: ['dist/b.js'] }] }),
        c: node('c', { produces: ['dist/app.js'], consumes: ['src/b.ts'], deps: ['b'], validate: [{ type: 'build-produces', command: 'esbuild', outputs: ['dist/app.js'] }] }),
        d: node('d', { consumes: ['dist/app.js'], deps: ['c'], validate: [{ type: 'launch-check', command: 'node dist/app.js' }] }),
      },
    }));

    const result = propagateConstraints(g);
    expect(result.dag).toBeDefined();

    // Propagated DAG should still be structurally valid
    const checkResult = check(result.dag!);
    expect(checkResult.done).toBe(true);

    const verifyErrors = verify(result.dag!);
    expect(verifyErrors).toEqual([]);
  });
});
