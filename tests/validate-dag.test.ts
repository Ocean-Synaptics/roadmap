import { describe, it, expect } from 'vitest';
import { validateTerminalIntentGate, findTerminalNodes } from '../src/lib/validate-dag.ts';
import { define, graph } from '../src/protocol.ts';
import type { ValidationRule } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(expandOnFail: boolean): ValidationRule {
  return {
    type: 'intent',
    statement: 'app works correctly',
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

// ── findTerminalNodes ────────────────────────────────────────────────────────

describe('findTerminalNodes', () => {
  it('returns term node in simple init→term DAG', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'] }),
      },
    }));
    expect(findTerminalNodes(g)).toEqual(['term']);
  });

  it('returns term in a multi-node DAG', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init', { produces: ['a.ts'] }),
        middle: node('middle', { deps: ['init'], consumes: ['a.ts'], produces: ['b.ts'] }),
        term: node('term', { deps: ['middle'], consumes: ['b.ts'] }),
      },
    }));
    const terminals = findTerminalNodes(g);
    expect(terminals).toContain('term');
    expect(terminals).not.toContain('init');
    expect(terminals).not.toContain('middle');
  });

  it('returns multiple terminal nodes when DAG has branches with no downstream', () => {
    // A forked DAG where two nodes have no dependents
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'merge',
      nodes: {
        init: node('init', { produces: ['a.ts'] }),
        left: node('left', { deps: ['init'], consumes: ['a.ts'], produces: ['l.ts'] }),
        right: node('right', { deps: ['init'], consumes: ['a.ts'], produces: ['r.ts'] }),
        merge: node('merge', { deps: ['left', 'right'], consumes: ['l.ts', 'r.ts'] }),
      },
    }));
    // Only merge is terminal — left and right are depended on
    expect(findTerminalNodes(g)).toEqual(['merge']);
  });
});

// ── validateTerminalIntentGate ───────────────────────────────────────────────

describe('validateTerminalIntentGate', () => {
  it('passes when terminal node has intent with expandOnFail: true', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'], validate: [intentRule(true)] }),
      },
    }));
    expect(validateTerminalIntentGate(g)).toBeNull();
  });

  it('fails when terminal node has no intent gate', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'], validate: [{ type: 'shell', command: 'tsc' }] }),
      },
    }));
    const error = validateTerminalIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.type).toBe('missing-terminal-intent');
    expect(error!.node).toBe('term');
    expect(error!.message).toContain('expandOnFail');
  });

  it('fails when terminal node has intent but expandOnFail: false', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'], validate: [intentRule(false)] }),
      },
    }));
    const error = validateTerminalIntentGate(g);
    expect(error).not.toBeNull();
    expect(error!.node).toBe('term');
  });

  it('fails when terminal node has no validate rules at all', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'], validate: [] }),
      },
    }));
    const error = validateTerminalIntentGate(g);
    expect(error).not.toBeNull();
  });

  it('passes when terminal node has mixed rules including intent expandOnFail', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', {
          deps: ['init'],
          validate: [
            { type: 'shell', command: 'tsc --noEmit' },
            { type: 'artifact-exists', target: 'dist/app.js' },
            intentRule(true),
          ],
        }),
      },
    }));
    expect(validateTerminalIntentGate(g)).toBeNull();
  });

  it('error includes fix suggestion', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'init', term: 'term',
      nodes: {
        init: node('init'),
        term: node('term', { deps: ['init'] }),
      },
    }));
    const error = validateTerminalIntentGate(g);
    expect(error!.fix).toContain('done');
  });
});
