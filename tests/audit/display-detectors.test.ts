import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { InteractionReceipt } from '../../src/lib/metaflow/types.ts';
import {
  detectMissingTable,
  detectMissingDagRender,
  detectMissingProgressBar,
  detectDisplayRegression,
} from '../../src/lib/metaflow/audit/detectors/display.ts';

function makeReceipt(base: string, overrides: Partial<InteractionReceipt> & { plainContent?: string } = {}): InteractionReceipt {
  const stepId = overrides.stepId ?? `step-${Math.random().toString(36).slice(2, 8)}`;
  const plainPath = join(base, `${stepId}.txt`);
  if (overrides.plainContent !== undefined) {
    writeFileSync(plainPath, overrides.plainContent);
  }
  return {
    schema_version: 1,
    runId: 'test-run' as any,
    stepId: stepId as any,
    cmd: overrides.cmd ?? 'orient',
    intent: overrides.intent ?? 'test',
    audience: overrides.audience ?? 'user',
    render: {
      plainPath,
      ansiPath: plainPath,
      width: 120,
      emoji: true,
      color: true,
      ...(overrides.render ?? {}),
    },
    evidence: {
      headSha: 'abc123',
      toolCalls: 1,
      latencyMs: 100,
      ...(overrides.evidence ?? {}),
    },
  };
}

describe('display-detectors', () => {
  let base: string;
  beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'display-det-')); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('RD-001 passes with table', () => {
    const r = makeReceipt(base, { cmd: 'orient', plainContent: 'L01 | node-a | done' });
    const result = detectMissingTable([r]);
    expect(result.code).toBe('RD-001');
    expect(result.passed).toBe(true);
  });

  it('RD-001 fails without table', () => {
    const r = makeReceipt(base, { cmd: 'chart', plainContent: 'no table here' });
    const result = detectMissingTable([r]);
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain('no table');
  });

  it('RD-002 passes with batch markers', () => {
    const r = makeReceipt(base, { cmd: 'orient', plainContent: 'L00 init-node done\nL01 work-node pending' });
    const result = detectMissingDagRender([r]);
    expect(result.code).toBe('RD-002');
    expect(result.passed).toBe(true);
  });

  it('RD-002 fails without batch markers', () => {
    const r = makeReceipt(base, { cmd: 'chart', plainContent: 'some output without markers' });
    const result = detectMissingDagRender([r]);
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain('no DAG markers');
  });

  it('RD-003 passes with progress bar', () => {
    const r = makeReceipt(base, { cmd: 'chart', plainContent: '[██░░░░░░] 25%' });
    const result = detectMissingProgressBar([r]);
    expect(result.code).toBe('RD-003');
    expect(result.passed).toBe(true);
  });

  it('RD-003 fails without progress bar', () => {
    const r = makeReceipt(base, { cmd: 'complete', plainContent: 'completed node-a' });
    const result = detectMissingProgressBar([r]);
    expect(result.passed).toBe(false);
    expect(result.evidence[0]).toContain('no progress bar');
  });

  it('detectDisplayRegression returns 3 results', () => {
    const r = makeReceipt(base, { cmd: 'chart', plainContent: 'L00 | node | [██░]' });
    const results = detectDisplayRegression([r]);
    expect(results).toHaveLength(3);
    expect(results.map(r => r.code)).toEqual(['RD-001', 'RD-002', 'RD-003']);
  });

  it('all pass on well-formed fixture', () => {
    const r = makeReceipt(base, {
      cmd: 'chart',
      plainContent: 'L00  ✅ init | done\nL01  👉 work | pending\n[████░░░░] 50%',
    });
    const results = detectDisplayRegression([r]);
    expect(results.every(r => r.passed)).toBe(true);
  });
});
