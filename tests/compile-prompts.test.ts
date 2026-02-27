import { describe, it, expect } from 'vitest';
import { define, graph } from '../src/protocol.ts';
import { compilePrompts, parseEnvironment, fillTemplate, validateCompiledPrompts, checkStaleness } from '../src/lib/compile-prompts.ts';
import type { ValidationRule } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function node(id: string, overrides: Partial<{
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  validate: ValidationRule[];
  ambient: string[];
}> = {}) {
  return {
    id, desc: overrides.desc ?? `task: ${id}`,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
    ...(overrides.ambient ? { ambient: overrides.ambient } : {}),
  };
}

function simpleDag() {
  return define(graph({
    id: 'test', desc: 'test dag', init: 'init', term: 'term',
    nodes: {
      init: node('init'),
      alpha: node('alpha', {
        desc: 'build alpha module',
        produces: ['src/alpha.ts'],
        consumes: ['shared/types.ts'],
        deps: ['init'],
        validate: [{ type: 'shell', command: 'tsc --noEmit' }],
      }),
      beta: node('beta', {
        desc: 'build beta module',
        produces: ['src/beta.ts'],
        consumes: ['src/alpha.ts'],
        deps: ['alpha'],
        validate: [
          { type: 'shell', command: 'npx vitest run tests/beta.test.ts' },
          { type: 'artifact-exists', target: 'src/beta.ts' },
        ],
      }),
      term: node('term', {
        consumes: ['src/alpha.ts', 'src/beta.ts'],
        deps: ['alpha', 'beta'],
      }),
    },
  }));
}

const SAMPLE_ENV = `
commit: abc123
date verified: 2026-01-15

## 1. Project Identity & Constraints
TypeScript monorepo. Node 22 required.

## 4. Architectural Invariants
No circular imports. Strict null checks.

## 6b. Core Entities
TodoItem, TodoStore

## 8. High-Entropy Zones
src/db.ts — known fragile boundary.
`;

// ── parseEnvironment ─────────────────────────────────────────────────────────

describe('parseEnvironment', () => {
  it('parses commit and dateVerified from preamble', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(env.commit).toBe('abc123');
    expect(env.dateVerified).toBe('2026-01-15');
  });

  it('maps architectural invariants section', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(env.invariants).toContain('No circular imports');
  });

  it('maps core entities section', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(env.coreEntities).toContain('TodoItem');
  });

  it('maps high-entropy zones section', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(env.highEntropyZones).toContain('src/db.ts');
  });

  it('raw contains all sections by lowercased heading', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    const keys = Object.keys(env.raw);
    expect(keys.some(k => k.includes('architectural invariant') || k.includes('4.'))).toBe(true);
  });

  it('handles environment with no sections', () => {
    const env = parseEnvironment('Just some text with no headers.');
    expect(env.invariants).toBeUndefined();
    expect(env.commit).toBeUndefined();
    expect(Object.keys(env.raw)).toHaveLength(0);
  });
});

// ── checkStaleness ───────────────────────────────────────────────────────────

describe('checkStaleness', () => {
  it('returns true when env commit differs from current', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(checkStaleness(env, 'deadbeef')).toBe(true);
  });

  it('returns false when env commit matches current', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    expect(checkStaleness(env, 'abc123')).toBe(false);
  });

  it('returns false when env has no commit field', () => {
    const env = parseEnvironment('## Some Section\nContent here.');
    expect(checkStaleness(env, 'deadbeef')).toBe(false);
  });
});

// ── fillTemplate ─────────────────────────────────────────────────────────────

describe('fillTemplate', () => {
  const template = `# {{task_definition}}\n**Domain**: {{domain}}\nFiles: {{files_list}}\nAllowed: {{allowed_to_modify}}\nRead-only: {{read_only}}\nArtifacts: {{required_artifacts}}\nCheck: {{quick_check}}\n{{verification_checklist}}\nConstraints: {{constraints}}\nEntities: {{entities}}`;

  it('substitutes task_definition from node.desc', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('build alpha module');
  });

  it('substitutes domain', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'renderer', null);
    expect(result).toContain('**Domain**: renderer');
  });

  it('substitutes files_list from consumes', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('shared/types.ts');
  });

  it('substitutes allowed_to_modify from produces', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('src/alpha.ts');
  });

  it('quick_check uses first shell validate command', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('tsc --noEmit');
  });

  it('quick_check defaults to tsc --noEmit when no shell validate', () => {
    const n = node('x', { produces: ['x.ts'] });
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('tsc --noEmit');
  });

  it('verification_checklist includes all validate rules', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['beta'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('npx vitest run tests/beta.test.ts');
    expect(result).toContain('src/beta.ts');
  });

  it('populates constraints from environment invariants', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    const n = node('x', { produces: ['x.ts'] });
    const result = fillTemplate(template, n, 'core', env);
    expect(result).toContain('No circular imports');
  });

  it('populates entities from environment coreEntities', () => {
    const env = parseEnvironment(SAMPLE_ENV);
    const n = node('x', { produces: ['x.ts'] });
    const result = fillTemplate(template, n, 'core', env);
    expect(result).toContain('TodoItem');
  });

  it('no unresolved {{placeholder}} in output', () => {
    const dag = simpleDag();
    const n = (dag.nodes as any)['alpha'];
    const result = fillTemplate(template, n, 'core', null);
    expect(result).not.toMatch(/\{\{\w+\}\}/);
  });

  it('ambient files appear in files_list', () => {
    const n = node('x', { ambient: ['spec.md'], produces: ['x.ts'] });
    const result = fillTemplate(template, n, 'core', null);
    expect(result).toContain('spec.md');
  });
});

// ── validateCompiledPrompts ───────────────────────────────────────────────────

describe('validateCompiledPrompts', () => {
  it('no violations for well-formed prompts', () => {
    const dag = simpleDag();
    const { prompts } = compilePrompts(dag as any, {});
    const violations = validateCompiledPrompts(prompts, dag as any);
    expect(violations).toHaveLength(0);
  });

  it('detects missing-produces: produces path absent from content', () => {
    const dag = simpleDag();
    const prompts = [{ node: 'alpha', path: 'prompts/prompt-alpha.md', domain: 'core', content: 'no paths here' }];
    const violations = validateCompiledPrompts(prompts, dag as any);
    const v = violations.find(v => v.type === 'missing-produces');
    expect(v).toBeDefined();
    expect(v!.node).toBe('alpha');
  });

  it('detects missing-consumes: consumes path absent from content', () => {
    const dag = simpleDag();
    const prompts = [{ node: 'alpha', path: 'prompts/prompt-alpha.md', domain: 'core', content: '`src/alpha.ts`' }];
    const violations = validateCompiledPrompts(prompts, dag as any);
    const v = violations.find(v => v.type === 'missing-consumes');
    expect(v).toBeDefined();
  });

  it('detects empty-domain', () => {
    const dag = simpleDag();
    const prompts = [{ node: 'alpha', path: 'p.md', domain: '', content: '`src/alpha.ts` `shared/types.ts`' }];
    const violations = validateCompiledPrompts(prompts, dag as any);
    expect(violations.some(v => v.type === 'empty-domain')).toBe(true);
  });

  it('detects ownership-conflict: two prompts share a produces path', () => {
    const dag = simpleDag();
    const prompts = [
      { node: 'alpha', path: 'p1.md', domain: 'core', content: '`src/alpha.ts` `shared/types.ts`' },
      { node: 'beta', path: 'p2.md', domain: 'core', content: '`src/alpha.ts` `src/beta.ts`' }, // beta should not own src/alpha.ts
    ];
    // Override beta's produces to overlap alpha for test
    const dagCopy: any = {
      ...dag,
      nodes: {
        ...dag.nodes,
        beta: { ...(dag.nodes as any)['beta'], produces: ['src/alpha.ts', 'src/beta.ts'] },
      },
    };
    const violations = validateCompiledPrompts(prompts, dagCopy);
    expect(violations.some(v => v.type === 'ownership-conflict')).toBe(true);
  });
});

// ── compilePrompts (integration) ─────────────────────────────────────────────

describe('compilePrompts', () => {
  it('compiles all non-structural nodes', () => {
    const dag = simpleDag();
    const { result } = compilePrompts(dag as any, {});
    expect(result.compiled).toBe(2); // alpha, beta (init/term excluded)
    expect(result.prompts.map(p => p.node).sort()).toEqual(['alpha', 'beta']);
  });

  it('output paths follow prompts/prompt-<node-id>.md convention', () => {
    const dag = simpleDag();
    const { result } = compilePrompts(dag as any, { out: 'prompts' });
    for (const p of result.prompts) {
      expect(p.path).toBe(`prompts/prompt-${p.node}.md`);
    }
  });

  it('custom out directory reflected in paths', () => {
    const dag = simpleDag();
    const { result } = compilePrompts(dag as any, { out: 'dist/prompts' });
    expect(result.outputDir).toBe('dist/prompts');
    for (const p of result.prompts) expect(p.path).toMatch(/^dist\/prompts\//);
  });

  it('--node filters to single node', () => {
    const dag = simpleDag();
    const { result } = compilePrompts(dag as any, { nodes: ['alpha'] });
    expect(result.compiled).toBe(1);
    expect(result.prompts[0].node).toBe('alpha');
  });

  it('unknown node is skipped (counted in skipped)', () => {
    const dag = simpleDag();
    const { result } = compilePrompts(dag as any, { nodes: ['nonexistent'] });
    expect(result.compiled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('deterministic: same DAG + same env → same content on repeated calls', () => {
    const dag = simpleDag();
    const env = parseEnvironment(SAMPLE_ENV);
    const { prompts: p1 } = compilePrompts(dag as any, { envSource: SAMPLE_ENV });
    const { prompts: p2 } = compilePrompts(dag as any, { envSource: SAMPLE_ENV });
    expect(p1.map(p => p.content)).toEqual(p2.map(p => p.content));
  });

  it('stale flag set when env commit differs from currentCommit', () => {
    const dag = simpleDag();
    const { stale } = compilePrompts(dag as any, { envSource: SAMPLE_ENV, currentCommit: 'different' });
    expect(stale).toBe(true);
  });

  it('stale flag false when commits match', () => {
    const dag = simpleDag();
    const { stale } = compilePrompts(dag as any, { envSource: SAMPLE_ENV, currentCommit: 'abc123' });
    expect(stale).toBe(false);
  });

  it('domain falls back to node-id prefix when no clusterResult', () => {
    const dag = simpleDag();
    const { prompts } = compilePrompts(dag as any, {});
    // alpha → domain 'alpha' (first segment)
    const alpha = prompts.find(p => p.node === 'alpha')!;
    expect(alpha.domain).toBeTruthy();
  });

  it('domain resolved from cluster when clusterResult provided', () => {
    const dag = simpleDag();
    const fakeCluster = {
      clusters: [{ id: 'myCluster', nodes: ['alpha', 'beta'], internalOrder: [], produces: [], consumes: [], crossClusterDeps: [], coupling: 0, critical: false, context: [] }],
      clusterCount: 1, maxParallelClusters: 1, agentCount: 1,
    };
    const { prompts } = compilePrompts(dag as any, { clusterResult: fakeCluster });
    const alpha = prompts.find(p => p.node === 'alpha')!;
    expect(alpha.domain).toBe('myCluster');
  });

  it('field-mapped content: produces appears in Allowed to modify', () => {
    const dag = simpleDag();
    const { prompts } = compilePrompts(dag as any, {});
    const alpha = prompts.find(p => p.node === 'alpha')!;
    expect(alpha.content).toContain('src/alpha.ts');
  });

  it('field-mapped content: consumes appears in Files to read', () => {
    const dag = simpleDag();
    const { prompts } = compilePrompts(dag as any, {});
    const alpha = prompts.find(p => p.node === 'alpha')!;
    expect(alpha.content).toContain('shared/types.ts');
  });

  it('validate-only returns violations without writing', () => {
    const dag = simpleDag();
    const { result, violations } = compilePrompts(dag as any, { validateOnly: true });
    expect(result.compiled).toBeGreaterThan(0);
    expect(Array.isArray(violations)).toBe(true);
  });

  it('custom template is used when templateSource provided', () => {
    const dag = simpleDag();
    const customTemplate = 'NODE: {{task_definition}} | DOMAIN: {{domain}}';
    const { prompts } = compilePrompts(dag as any, { templateSource: customTemplate });
    const alpha = prompts.find(p => p.node === 'alpha')!;
    expect(alpha.content).toMatch(/NODE: .+ \| DOMAIN: .+/);
  });
});
