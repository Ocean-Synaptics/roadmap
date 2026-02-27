import { describe, it, expect } from 'vitest';
import { validateTerminalIntentGate, validateInitIntentGate, findInitBoundary } from '../src/lib/validate-dag.ts';
import { define, graph } from '../src/protocol.ts';
import type { ValidationRule } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(statement: string, expandOnFail: boolean): ValidationRule {
  return {
    type: 'intent',
    statement,
    confidence: 0.9,
    evaluator: 'self',
    expandOnFail,
  };
}

function node(id: string, overrides: Partial<{ produces: string[]; consumes: string[]; deps: string[]; validate: ValidationRule[] }> = {}) {
  return {
    id, desc: id,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
  };
}

// ── findInitBoundary ─────────────────────────────────────────────────────────

describe('findInitBoundary', () => {
  it('returns nodes with single init dependency', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', { deps: ['init'] }),
        term: node('term', { deps: ['plan'] }),
      },
    }));
    expect(findInitBoundary(g)).toEqual(['plan']);
  });

  it('returns multiple nodes when multiple depend directly on init', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        a: node('a', { deps: ['init'] }),
        b: node('b', { deps: ['init'] }),
        term: node('term', { deps: ['a', 'b'] }),
      },
    }));
    const boundary = findInitBoundary(g);
    expect(boundary).toContain('a');
    expect(boundary).toContain('b');
    expect(boundary.length).toBe(2);
  });

  it('returns empty array when no nodes depend directly on init', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        a: node('a'),
        term: node('term', { deps: ['a'] }),
      },
    }));
    expect(findInitBoundary(g)).toEqual([]);
  });

  it('returns alphabetically sorted boundary nodes', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        z: node('z', { deps: ['init'] }),
        a: node('a', { deps: ['init'] }),
        m: node('m', { deps: ['init'] }),
        term: node('term', { deps: ['z', 'a', 'm'] }),
      },
    }));
    expect(findInitBoundary(g)).toEqual(['a', 'm', 'z']);
  });
});

// ── validateInitIntentGate ───────────────────────────────────────────────────

describe('validateInitIntentGate', () => {
  it('passes when init boundary node has intent with expandOnFail and plan keyword', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('plan the roadmap for clarity', true)],
        }),
        term: node('term', {
          deps: ['plan'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
  });

  it('passes when init boundary has intent with clarity keyword', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        setup: node('setup', {
          deps: ['init'],
          validate: [intentRule('establish clarity on requirements', true)],
        }),
        term: node('term', {
          deps: ['setup'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
  });

  it('passes when init boundary has intent with unambiguous keyword', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        spec: node('spec', {
          deps: ['init'],
          validate: [intentRule('make requirements unambiguous', true)],
        }),
        term: node('term', {
          deps: ['spec'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
  });

  it('fails when init boundary node has no intent rule', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['plan'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    const error = validateInitIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('missing-init-intent');
  });

  it('fails when init boundary intent has expandOnFail: false', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('plan for clarity', false)],
        }),
        term: node('term', {
          deps: ['plan'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    const error = validateInitIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('init-gate-no-expand-on-fail');
    expect(error!.message).toContain('expandOnFail');
  });

  it('fails when init boundary intent lacks clarity keywords', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        setup: node('setup', {
          deps: ['init'],
          validate: [intentRule('build some feature', true)],
        }),
        term: node('term', {
          deps: ['setup'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    const error = validateInitIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('missing-init-intent');
    expect(error!.message).toContain('plan/clarity/unambiguous');
  });

  it('fails when no init boundary exists', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        orphan: node('orphan'),
        term: node('term', { deps: ['orphan'] }),
      },
    }));
    const error = validateInitIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('missing-init-intent');
    expect(error!.message).toContain('no nodes depend directly on init');
  });

  it('error includes fix suggestion', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('build feature', true)],
        }),
        term: node('term', {
          deps: ['plan'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    const error = validateInitIntentGate(g);
    expect(error!.fix).toBeDefined();
  });

  it('passes when multiple init-adjacent nodes exist, one has correct gate', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('plan clearly', true)],
        }),
        other: node('other', {
          deps: ['init'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['plan', 'other'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
  });
});

// ── Bookend Integration ──────────────────────────────────────────────────────

describe('Bookend Gates (init + terminal)', () => {
  it('passes when both init and terminal gates are present', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('establish clarity', true)],
        }),
        work: node('work', {
          deps: ['plan'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['work'],
          validate: [intentRule('feature complete', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
    expect(validateTerminalIntentGate(g)).toBeNull();
  });

  it('fails when init gate missing but terminal gate present', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        work: node('work', {
          deps: ['init'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['work'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).not.toBeNull();
    expect(validateTerminalIntentGate(g)).toBeNull();
  });

  it('fails when terminal gate missing but init gate present', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('plan clearly', true)],
        }),
        work: node('work', {
          deps: ['plan'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['work'],
          validate: [{ type: 'artifact-exists', target: 'dist/app.js' }],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
    expect(validateTerminalIntentGate(g)).not.toBeNull();
  });

  it('fails when both gates missing', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        work: node('work', {
          deps: ['init'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['work'],
          validate: [{ type: 'artifact-exists', target: 'dist/app.js' }],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).not.toBeNull();
    expect(validateTerminalIntentGate(g)).not.toBeNull();
  });

  it('fails when init gate has no expandOnFail but terminal does', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        plan: node('plan', {
          deps: ['init'],
          validate: [intentRule('plan for clarity', false)],
        }),
        term: node('term', {
          deps: ['plan'],
          validate: [intentRule('done', true)],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).not.toBeNull();
    expect(validateTerminalIntentGate(g)).toBeNull();
  });

  it('passes with multi-level DAG when gates properly placed', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        spec: node('spec', {
          deps: ['init'],
          validate: [intentRule('specify requirements with clarity', true)],
        }),
        design: node('design', {
          deps: ['spec'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        impl: node('impl', {
          deps: ['design'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        test: node('test', {
          deps: ['impl'],
          validate: [{ type: 'shell', command: 'true' }],
        }),
        term: node('term', {
          deps: ['test'],
          validate: [
            { type: 'shell', command: 'tsc' },
            intentRule('all requirements met with high confidence', true),
          ],
        }),
      },
    }));
    expect(validateInitIntentGate(g)).toBeNull();
    expect(validateTerminalIntentGate(g)).toBeNull();
  });
});
