import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function runCmd(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', 'bin/roadmap.ts', ...args], {
      cwd: ROOT, encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' },
      timeout: 30_000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.status ?? 1 };
  }
}

/** Extract last JSON envelope from stdout (chart prepends legacy console.log) */
function extractJson(stdout: string): any {
  // Pretty-printed JSON: find last standalone '{' that starts a schema_version envelope
  const marker = '"schema_version"';
  const mIdx = stdout.lastIndexOf(marker);
  if (mIdx < 0) return JSON.parse(stdout);
  // Walk back to the opening brace
  const braceIdx = stdout.lastIndexOf('{', mIdx);
  if (braceIdx < 0) return JSON.parse(stdout);
  return JSON.parse(stdout.slice(braceIdx));
}

describe('ui-snapshot: orient --check', () => {
  const result = runCmd(['orient', '--check', '--note', 'snapshot-test']);
  const parsed = () => extractJson(result.stdout);

  it('stdout is valid JSON with schema_version:1', () => {
    const j = parsed();
    expect(j.schema_version).toBe(1);
  });

  it('stdout JSON has ok field', () => {
    const j = parsed();
    expect(typeof j.ok).toBe('boolean');
  });

  it('stdout JSON has render spec (format, mime, title)', () => {
    const j = parsed();
    expect(j.render).toBeDefined();
    expect(j.render.format).toBeDefined();
    expect(j.render.mime).toBeDefined();
    expect(j.render.title).toBeDefined();
    expect(j.render.body).toBeUndefined();
  });

  it('stdout JSON render.mime === text/x-roadmap-ui', () => {
    const j = parsed();
    expect(j.render.mime).toBe('text/x-roadmap-ui');
  });

  it('render spec guides client-side rendering (data contains structured output)', () => {
    // Render output goes to stderr. The JSON envelope contains the data and render spec.
    // Consumers must parse data and follow render.format to generate output.
    const j = parsed();
    expect(j.render).toBeDefined();
    expect(j.render.format).toBeDefined();
    expect(j.render.mime).toBe('text/x-roadmap-ui');
    expect(j.data).toBeDefined();
  });

  it('render.format specifies plain (NO_COLOR=1)', () => {
    const j = parsed();
    expect(j.render.format).toBe('plain');
  });

  it('render spec has valid format and mime', () => {
    const j = parsed();
    expect(['ansi', 'plain']).toContain(j.render.format);
    expect(j.render.mime).toBe('text/x-roadmap-ui');
  });
});

describe('ui-snapshot: chart', () => {
  const result = runCmd(['chart']);

  it('stdout contains valid JSON envelope', () => {
    const j = extractJson(result.stdout);
    expect(j.schema_version).toBe(1);
    expect(j.ok).toBe(true);
    expect(j.cmd).toBe('chart');
  });

  it('stdout JSON has render spec', () => {
    const j = extractJson(result.stdout);
    expect(j.render).toBeDefined();
    expect(j.render.format).toBeDefined();
    expect(j.render.mime).toBe('text/x-roadmap-ui');
    expect(j.render.body).toBeUndefined();
  });
});

describe('ui-snapshot: env-audit', () => {
  const result = runCmd(['env-audit']);

  it('stdout is valid JSON', () => {
    const j = extractJson(result.stdout);
    expect(j.schema_version).toBe(1);
    expect(typeof j.ok).toBe('boolean');
  });

  it('stdout JSON envelope is well-formed', () => {
    const j = extractJson(result.stdout);
    expect(j.cmd).toBe('env-audit');
    expect(typeof j.repoRoot).toBe('string');
  });
});

describe('ui-snapshot: doctor completion', () => {
  it('stdout is valid JSON with --json flag', () => {
    const result = runCmd(['doctor', 'completion', '--json']);
    const j = extractJson(result.stdout);
    expect(j.schema_version).toBe(1);
    expect(typeof j.ok).toBe('boolean');
  });
});

describe('ui-snapshot: --quiet flag', () => {
  it('orient --quiet produces no stdout', () => {
    const result = runCmd(['orient', '--check', '--quiet', '--note', 'quiet-test']);
    expect(result.stdout.trim()).toBe('');
  });
});

describe('ui-snapshot: determinism', () => {
  it('orient render.format and data are deterministic across two runs', () => {
    const r1 = runCmd(['orient', '--check', '--note', 'det-1']);
    const r2 = runCmd(['orient', '--check', '--note', 'det-2']);
    const j1 = extractJson(r1.stdout);
    const j2 = extractJson(r2.stdout);
    expect(j1.render.format).toBe(j2.render.format);
    expect(JSON.stringify(j1.data)).toBe(JSON.stringify(j2.data));
  });
});
