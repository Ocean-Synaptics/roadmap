// @module plan-gate-tests
// Tests for scripts/ci/roadmap-plan-gate.ts
//
// Strategy: copy the script into a temp dir at scripts/ci/roadmap-plan-gate.ts
// so import.meta.dirname resolves to tmpDir/scripts/ci/ and root = tmpDir.
// Set up .roadmap/head.json and a git repo with a known diff in that temp dir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Absolute path to the script in this worktree
const SCRIPT_SRC = resolve(import.meta.dirname, '../scripts/ci/roadmap-plan-gate.ts');

// --- Helpers ---

function setupGitRepo(dir: string, headJson: object, changedFiles: string[]): void {
  // Place the script at scripts/ci/ so import.meta.dirname resolves root = dir
  mkdirSync(join(dir, 'scripts', 'ci'), { recursive: true });
  cpSync(SCRIPT_SRC, join(dir, 'scripts', 'ci', 'roadmap-plan-gate.ts'));

  // tsx needs "type":"module" to resolve import.meta.dirname in ESM mode
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));

  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  writeFileSync(join(dir, '.roadmap', 'head.json'), JSON.stringify(headJson, null, 2));

  spawnSync('git', ['init'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });

  // Initial commit — baseline state
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'initial', '--allow-empty'], { cwd: dir });

  // Second commit — the "changed" files that constitute the diff
  for (const f of changedFiles) {
    const full = join(dir, f);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, 'changed');
  }
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'changes'], { cwd: dir });
}

function runPlanGate(dir: string, baseRef = 'HEAD~1'): { status: number; result: any; stderr: string } {
  const scriptPath = join(dir, 'scripts', 'ci', 'roadmap-plan-gate.ts');
  const r = spawnSync('npx', ['tsx', scriptPath, baseRef], { cwd: dir, encoding: 'utf-8' });
  let result: any = null;
  try { result = JSON.parse(r.stdout); } catch { /* stdout not JSON */ }
  return { status: r.status ?? -1, result, stderr: r.stderr ?? '' };
}

// --- Fixtures ---

function makeHeadJson(nodes: Record<string, any>): object {
  return { id: 'test-dag', desc: 'test', init: 'init', term: 'term', nodes };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-gate-test-'));
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// --- Tests ---

describe('plan-gate CI script', () => {
  it('governed-no-plan: governed file without rm-* Track 0 node → fail with violation', () => {
    // A node that produces the file but is NOT an rm-* node
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      impl: {
        id: 'impl',
        desc: 'implementation node',
        produces: ['src/feature.ts'],
        consumes: [],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      term: { id: 'term', produces: [], consumes: [], deps: ['impl'], validate: [], idempotent: false, desc: 'term' },
    });

    setupGitRepo(tmpDir, headJson, ['src/feature.ts']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(false);
    expect(result.governed).toContain('src/feature.ts');
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].file).toBe('src/feature.ts');
    expect(status).toBe(1);
  });

  it('governed-with-plan: governed file covered by rm-* Track 0 node → pass', () => {
    // An rm-* node that produces the file (qualifies as plan-gate approver)
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      'rm-feature': {
        id: 'rm-feature',
        desc: 'rm Track 0 node covering the file',
        produces: ['src/feature.ts'],
        consumes: [],
        deps: ['init'],
        validate: [],
        idempotent: true,
        track: 0,
      },
      term: {
        id: 'term', produces: [], consumes: [], deps: ['rm-feature'], validate: [], idempotent: false, desc: 'term',
      },
    });

    setupGitRepo(tmpDir, headJson, ['src/feature.ts']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.governed).toContain('src/feature.ts');
    expect(result.violations).toHaveLength(0);
    expect(status).toBe(0);
  });

  it('docs-only: changed file not in any node produces/affects → ungoverned, passed=true', () => {
    // DAG has no node referencing README.md
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      term: { id: 'term', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: false, desc: 'term' },
    });

    setupGitRepo(tmpDir, headJson, ['README.md']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result).not.toBeNull();
    expect(result.passed).toBe(true);
    expect(result.ungoverned).toContain('README.md');
    expect(result.governed).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
    expect(status).toBe(0);
  });

  it('rm-* node with track undefined defaults to Track 0 → qualifies as approver', () => {
    // track omitted → defaults to 0, should qualify
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      'rm-no-track': {
        id: 'rm-no-track',
        desc: 'rm node without explicit track field',
        produces: ['lib/core.ts'],
        consumes: [],
        deps: ['init'],
        validate: [],
        idempotent: true,
        // no track field — defaults to 0
      },
      term: {
        id: 'term', produces: [], consumes: [], deps: ['rm-no-track'], validate: [], idempotent: false, desc: 'term',
      },
    });

    setupGitRepo(tmpDir, headJson, ['lib/core.ts']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result.passed).toBe(true);
    expect(result.governed).toContain('lib/core.ts');
    expect(result.violations).toHaveLength(0);
    expect(status).toBe(0);
  });

  it('rm-* node with track=1 does NOT qualify → violation', () => {
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      'rm-track1': {
        id: 'rm-track1',
        desc: 'rm node on Track 1 — non-qualifying',
        produces: ['lib/util.ts'],
        consumes: [],
        deps: ['init'],
        validate: [],
        idempotent: true,
        track: 1,
      },
      term: {
        id: 'term', produces: [], consumes: [], deps: ['rm-track1'], validate: [], idempotent: false, desc: 'term',
      },
    });

    setupGitRepo(tmpDir, headJson, ['lib/util.ts']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result.passed).toBe(false);
    expect(result.governed).toContain('lib/util.ts');
    expect(result.violations).toHaveLength(1);
    expect(status).toBe(1);
  });

  it('affects field also governs files', () => {
    // A non-rm node uses `affects` to govern a file, no rm-* node covers it → violation
    const headJson = makeHeadJson({
      init: { id: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true, desc: 'init' },
      impl: {
        id: 'impl',
        desc: 'node using affects field',
        produces: [],
        affects: ['docs/spec.md'],
        consumes: [],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      term: { id: 'term', produces: [], consumes: [], deps: ['impl'], validate: [], idempotent: false, desc: 'term' },
    });

    setupGitRepo(tmpDir, headJson, ['docs/spec.md']);
    const { status, result } = runPlanGate(tmpDir);

    expect(result.passed).toBe(false);
    expect(result.governed).toContain('docs/spec.md');
    expect(result.violations[0].file).toBe('docs/spec.md');
    expect(status).toBe(1);
  });
});
