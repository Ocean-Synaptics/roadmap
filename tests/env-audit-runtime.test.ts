import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runEnvAudit, DEPRECATED_ENV_VARS, KERNEL_REPLACEMENTS } from '../src/lib/env-audit.ts';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('env-audit runtime detection', () => {
  let tmpRoot: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'env-audit-'));
    for (const v of DEPRECATED_ENV_VARS) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of DEPRECATED_ENV_VARS) {
      if (savedEnv[v] !== undefined) process.env[v] = savedEnv[v];
      else delete process.env[v];
    }
  });

  it('passes when no deprecated env vars are set', () => {
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.kernelJsonExists).toBe(false);
  });

  it('detects SKIP_PLAN_GATE', () => {
    process.env.SKIP_PLAN_GATE = 'true';
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].envVar).toBe('SKIP_PLAN_GATE');
    expect(result.violations[0].kernelReplacement).toBe('policy.skipPlanGate');
  });

  it('detects SKIP_BATCH_COMMIT', () => {
    process.env.SKIP_BATCH_COMMIT = 'worker';
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].envVar).toBe('SKIP_BATCH_COMMIT');
    expect(result.violations[0].value).toBe('worker');
  });

  it('detects ROADMAP_VALIDATING', () => {
    process.env.ROADMAP_VALIDATING = '1';
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(false);
    expect(result.violations[0].envVar).toBe('ROADMAP_VALIDATING');
    expect(result.violations[0].kernelReplacement).toBe('policy.validating');
  });

  it('detects multiple violations', () => {
    process.env.SKIP_PLAN_GATE = 'yes';
    process.env.SKIP_BATCH_COMMIT = 'rkg-worker';
    process.env.ROADMAP_VALIDATING = '1';
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(false);
    expect(result.violations).toHaveLength(3);
  });

  it('ignores empty string values', () => {
    process.env.SKIP_PLAN_GATE = '';
    const result = runEnvAudit(tmpRoot);
    expect(result.pass).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports kernel.json existence', () => {
    mkdirSync(join(tmpRoot, '.roadmap'), { recursive: true });
    writeFileSync(join(tmpRoot, '.roadmap', 'kernel.json'), '{}');
    const result = runEnvAudit(tmpRoot);
    expect(result.kernelJsonExists).toBe(true);
  });

  it('includes fix instructions in violations', () => {
    process.env.SKIP_BATCH_COMMIT = 'test';
    const result = runEnvAudit(tmpRoot);
    expect(result.violations[0].fix).toContain('policy.skipBatchCommit');
    expect(result.violations[0].fix).toContain('kernel.json');
  });

  it('KERNEL_REPLACEMENTS covers all DEPRECATED_ENV_VARS', () => {
    for (const v of DEPRECATED_ENV_VARS) {
      expect(KERNEL_REPLACEMENTS[v]).toBeDefined();
    }
  });

  it('includes checkedAt timestamp', () => {
    const result = runEnvAudit(tmpRoot);
    expect(result.checkedAt).toBeTruthy();
    expect(new Date(result.checkedAt).getTime()).not.toBeNaN();
  });
});
