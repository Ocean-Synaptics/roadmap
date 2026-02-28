/**
 * FR-GOV-012: Environment variable bypass removal.
 * Verifies SKIP_PLAN_GATE eliminated from production code,
 * ROADMAP_VALIDATING demoted to recursion guard (config, not bypass),
 * and validateNode accepts opts.validating as primary guard.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = join(import.meta.dirname, '..');

describe('env bypass removal', () => {
  // --- SKIP_PLAN_GATE ---

  it('no SKIP_PLAN_GATE reads in bin/roadmap.ts', () => {
    const content = readFileSync(join(root, 'bin/roadmap.ts'), 'utf-8');
    const reads = content.match(/process\.env\[['"]SKIP_PLAN_GATE['"]\]|process\.env\.SKIP_PLAN_GATE/g);
    expect(reads).toBeNull();
  });

  it('no SKIP_PLAN_GATE reads in src/', () => {
    const protocol = readFileSync(join(root, 'src/protocol.ts'), 'utf-8');
    const reads = protocol.match(/process\.env\[['"]SKIP_PLAN_GATE['"]\]|process\.env\.SKIP_PLAN_GATE/g);
    expect(reads).toBeNull();
  });

  // --- ROADMAP_VALIDATING: opts.validating primary, env fallback ---

  it('validateNode accepts validating option', async () => {
    const { validateNode } = await import('../src/protocol.ts');
    // Minimal graph with a shell rule
    const g = {
      id: 'test',
      desc: 'test',
      init: 'a',
      term: 'a',
      nodes: {
        a: {
          id: 'a', desc: 'test', produces: [], consumes: [], deps: [],
          validate: [{ type: 'shell' as const, command: 'exit 1' }],
        },
      },
    };
    // With validating: true, shell validators are skipped (passed with "skipped" evidence)
    const result = await validateNode(g, 'a', () => true, { validating: true });
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped (already inside validation)');
  });

  it('validateNode runs shell validators when validating is false', async () => {
    const { validateNode } = await import('../src/protocol.ts');
    const g = {
      id: 'test',
      desc: 'test',
      init: 'a',
      term: 'a',
      nodes: {
        a: {
          id: 'a', desc: 'test', produces: [], consumes: [], deps: [],
          validate: [{ type: 'shell' as const, command: 'echo ok' }],
        },
      },
    };
    // Without validating, shell command actually executes
    const result = await validateNode(g, 'a', () => true, { validating: false });
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('command passed');
  });

  it('validateNode skips function validator with validating option', async () => {
    const { validateNode } = await import('../src/protocol.ts');
    const g = {
      id: 'test',
      desc: 'test',
      init: 'a',
      term: 'a',
      nodes: {
        a: {
          id: 'a', desc: 'test', produces: [], consumes: [], deps: [],
          validate: [{ type: 'function' as const, fn: 'exit 1' }],
        },
      },
    };
    const result = await validateNode(g, 'a', () => true, { validating: true });
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped (already inside validation)');
  });

  it('validateNode skips build-produces validator with validating option', async () => {
    const { validateNode } = await import('../src/protocol.ts');
    const g = {
      id: 'test',
      desc: 'test',
      init: 'a',
      term: 'a',
      nodes: {
        a: {
          id: 'a', desc: 'test', produces: [], consumes: [], deps: [],
          validate: [{ type: 'build-produces' as const, command: 'exit 1', outputs: ['x'] }],
        },
      },
    };
    const result = await validateNode(g, 'a', () => true, { validating: true });
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped (already inside validation)');
  });

  it('validateNode skips launch-check validator with validating option', async () => {
    const { validateNode } = await import('../src/protocol.ts');
    const g = {
      id: 'test',
      desc: 'test',
      init: 'a',
      term: 'a',
      nodes: {
        a: {
          id: 'a', desc: 'test', produces: [], consumes: [], deps: [],
          validate: [{ type: 'launch-check' as const, command: 'exit 1' }],
        },
      },
    };
    const result = await validateNode(g, 'a', () => true, { validating: true });
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped (already inside validation)');
  });

  // --- Audit tool ---

  it('audit-env-bypasses classifies ROADMAP_VALIDATING as config', async () => {
    const { classify } = await import('../tools/audit-env-bypasses.ts');
    expect(classify('ROADMAP_VALIDATING')).toBe('config');
  });

  it('audit-env-bypasses classifies SKIP_PLAN_GATE as bypass', async () => {
    const { classify } = await import('../tools/audit-env-bypasses.ts');
    expect(classify('SKIP_PLAN_GATE')).toBe('bypass');
  });

  it('audit-env-bypasses scan passes (exit 0)', async () => {
    const { scan } = await import('../tools/audit-env-bypasses.ts');
    const result = scan(root);
    if (!result.passed) {
      const violationSummary = result.violations.map(v => `${v.file}:${v.line} ${v.variable}`).join('\n');
      expect.fail(`Audit violations:\n${violationSummary}`);
    }
    expect(result.passed).toBe(true);
  });

  it('audit-env-bypasses finds zero bypass violations in src/ and bin/', async () => {
    const { scan } = await import('../tools/audit-env-bypasses.ts');
    const result = scan(root);
    const prodViolations = result.violations.filter(
      v => v.file.startsWith('src/') || v.file.startsWith('bin/')
    );
    expect(prodViolations).toEqual([]);
  });
});
