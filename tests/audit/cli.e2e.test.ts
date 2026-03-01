import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { AuditContract } from '../../src/lib/metaflow/audit/required-schema.ts';
import { cmdMfAudit, cmdAuditTailEmit } from '../../src/lib/metaflow/audit/cli.ts';

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'audit-cli-'));
  const auditDir = join(base, '.roadmap', 'metaflow', 'audit');
  mkdirSync(auditDir, { recursive: true });
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  writeFileSync(join(auditDir, 'REQUIRED.json'), JSON.stringify({
    schema_version: 1,
    version: '1.0.0',
    thresholds: { latencyP95MaxMs: 5000, toolCallInflationMax: 10, orientChurnMax: 3 },
    requiredDetectors: ['RD-001', 'RD-002', 'RD-003', 'IR-001', 'IR-002', 'IR-003', 'IR-004', 'IR-005', 'PE-001'],
    requiredTerminalNodeId: 'intent-metaflow-audit-required',
    bindFields: ['treeSha', 'sessionIds', 'runId'],
  } satisfies AuditContract));
  return base;
}

function makeGitBase(): string {
  const base = makeBase();
  execSync('git init', { cwd: base, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: base, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: base, stdio: 'pipe' });
  writeFileSync(join(base, '.roadmap', 'completed.json'), '{}');
  execSync('git add -A && git commit -m "init"', { cwd: base, stdio: 'pipe' });
  return base;
}

describe('audit CLI', () => {
  let base: string;
  beforeEach(() => { base = makeBase(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('mf audit --required outputs REQUIRED.json fields', () => {
    const { data, render } = cmdMfAudit('test-run', { required: true, base });
    expect(data.schema_version).toBe(1);
    expect(data.version).toBe('1.0.0');
    expect(data.requiredDetectors).toContain('RD-001');
    expect(render).toContain('Terminal Node');
    expect(render).toContain('intent-metaflow-audit-required');
  });

  it('mf audit --run produces schema_version:1 AuditReport JSON', () => {
    const { data } = cmdMfAudit('mf-fixture-001', { base });
    expect(data.schema_version).toBe(1);
    expect(data.runId).toBe('mf-fixture-001');
    expect(typeof data.passed).toBe('boolean');
    expect(Array.isArray(data.detectorResults)).toBe(true);
  });

  it('PASSED/FAILED banner in render', () => {
    const { render } = cmdMfAudit('test-run', { base });
    expect(render).toMatch(/PASSED|FAILED/);
  });

  it('mf audit-tail emit outputs valid tasks.md fragment', () => {
    const { data, render } = cmdAuditTailEmit('my-dag', base);
    expect(data.terminalNodeId).toBe('intent-metaflow-audit-required');
    expect(render).toContain('intent-metaflow-audit-required');
    expect(render).toContain('## Audit Tail');
  });

  it('fragment contains required detectors', () => {
    const { render } = cmdAuditTailEmit('my-dag', base);
    expect(render).toContain('RD-001');
    expect(render).toContain('IR-001');
    expect(render).toContain('PE-001');
  });

  it('fragment parseable — contains markdown headings', () => {
    const { render } = cmdAuditTailEmit('my-dag', base);
    expect(render).toMatch(/^## /m);
    expect(render).toMatch(/^### /m);
  });

  it('re-run audit is idempotent', () => {
    const r1 = cmdMfAudit('idem-run', { base });
    const r2 = cmdMfAudit('idem-run', { base });
    expect(r1.data.passed).toBe(r2.data.passed);
    expect(r1.data.detectorResults.length).toBe(r2.data.detectorResults.length);
  });
});

describe('audit CLI (git)', () => {
  let base: string;
  beforeEach(() => { base = makeGitBase(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('all-pass on clean fixture run', () => {
    // Set up git-state + PLAN_SELECTED for clean IR detectors
    const sha = execSync('git rev-parse HEAD', { cwd: base, encoding: 'utf8' }).trim();
    writeFileSync(join(base, '.roadmap', 'git-state.json'), JSON.stringify({ activePlan: 'test-dag' }));
    writeFileSync(join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), JSON.stringify({ headSha: sha }));

    const { data } = cmdMfAudit('clean-run', { base });
    // Display detectors pass vacuously (no receipts to check)
    // Integration detectors: IR-001 passes (PLAN_SELECTED exists), IR-002 passes (activePlan set),
    // IR-003 passes (no receipts), IR-004 passes (completed.json committed), IR-005 passes (no hotspots)
    // PE-001 passes (no unregistered commands)
    expect(data.passed).toBe(true);
  });
});
