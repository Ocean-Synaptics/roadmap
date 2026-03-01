import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { InteractionReceipt, MiningResult, SessionBinding } from '../../src/lib/metaflow/types.ts';
import { detectIntegrationRoughPoints } from '../../src/lib/metaflow/audit/detectors/integration.ts';

function makeGitBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'integ-det-'));
  execSync('git init', { cwd: base, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: base, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: base, stdio: 'pipe' });
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  mkdirSync(join(base, '.roadmap', 'metaflow', 'runs'), { recursive: true });
  writeFileSync(join(base, '.roadmap', 'completed.json'), '{}');
  return base;
}

function commitAll(base: string, msg: string) {
  execSync('git add -A', { cwd: base, stdio: 'pipe' });
  execSync(`git commit --allow-empty -m "${msg}"`, { cwd: base, stdio: 'pipe' });
}

function headSha(base: string): string {
  return execSync('git rev-parse HEAD', { cwd: base, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function makeReceipt(overrides: Partial<InteractionReceipt> = {}): InteractionReceipt {
  return {
    schema_version: 1,
    runId: 'test-run' as any,
    stepId: (`step-${Math.random().toString(36).slice(2, 8)}`) as any,
    cmd: 'mf ask',
    intent: 'test',
    audience: 'user',
    render: { plainPath: '', ansiPath: '', width: 120, emoji: true, color: true },
    evidence: { headSha: 'abc', toolCalls: 1, latencyMs: 100 },
    ...overrides,
  };
}

function makeMining(overrides: Partial<MiningResult> = {}): MiningResult {
  return {
    schema_version: 1,
    runId: 'test-run' as any,
    computedAt: new Date().toISOString(),
    latencyP50Ms: 100,
    latencyP95Ms: 200,
    toolCallTotal: 5,
    hotspots: [],
    friction: [],
    teamReuseMissed: false,
    ...overrides,
  };
}

describe('integration-detectors', () => {
  let base: string;
  beforeEach(() => { base = makeGitBase(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('IR-001 passes with valid PLAN_SELECTED', () => {
    commitAll(base, 'init');
    // Write receipt with the SHA that will be HEAD when we check
    writeFileSync(join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), '{}');
    commitAll(base, 'add plan');
    // Now update receipt to match current HEAD
    const sha = headSha(base);
    writeFileSync(join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), JSON.stringify({ headSha: sha }));

    const results = detectIntegrationRoughPoints([], [], makeMining(), { base });
    const ir001 = results.find(r => r.code === 'IR-001')!;
    expect(ir001.passed).toBe(true);
  });

  it('IR-002 passes with matching activePlan', () => {
    commitAll(base, 'init');
    writeFileSync(join(base, '.roadmap', 'git-state.json'), JSON.stringify({ activePlan: 'my-dag' }));
    commitAll(base, 'state');

    const results = detectIntegrationRoughPoints([], [], makeMining(), { base });
    const ir002 = results.find(r => r.code === 'IR-002')!;
    expect(ir002.passed).toBe(true);
  });

  it('IR-004 fires on dirty completed.json', () => {
    commitAll(base, 'init');
    // Modify completed.json without committing
    writeFileSync(join(base, '.roadmap', 'completed.json'), '{"node-x": true}');

    const results = detectIntegrationRoughPoints([], [], makeMining(), { base });
    const ir004 = results.find(r => r.code === 'IR-004')!;
    expect(ir004.passed).toBe(false);
    expect(ir004.evidence[0]).toContain('uncommitted');
  });

  it('IR-005 fires on high hotspot count', () => {
    commitAll(base, 'init');
    const mining = makeMining({
      hotspots: [{ tool: 'readFile', count: 50, agentIds: ['a1'] }],
    });

    const results = detectIntegrationRoughPoints([], [], mining, {
      base,
      contract: { schema_version: 1, version: '1.0.0', thresholds: { latencyP95MaxMs: 5000, toolCallInflationMax: 10, orientChurnMax: 3 }, requiredDetectors: [], requiredTerminalNodeId: '', bindFields: ['treeSha', 'sessionIds', 'runId'] },
    });
    const ir005 = results.find(r => r.code === 'IR-005')!;
    expect(ir005.passed).toBe(false);
    expect(ir005.evidence[0]).toContain('readFile');
  });

  it('IR-005 fires on high latency', () => {
    commitAll(base, 'init');
    const mining = makeMining({ latencyP95Ms: 10000 });

    const results = detectIntegrationRoughPoints([], [], mining, {
      base,
      contract: { schema_version: 1, version: '1.0.0', thresholds: { latencyP95MaxMs: 5000, toolCallInflationMax: 10, orientChurnMax: 3 }, requiredDetectors: [], requiredTerminalNodeId: '', bindFields: ['treeSha', 'sessionIds', 'runId'] },
    });
    const ir005 = results.find(r => r.code === 'IR-005')!;
    expect(ir005.passed).toBe(false);
    expect(ir005.evidence.some(e => e.includes('P95'))).toBe(true);
  });

  it('PE-001 fires on unregistered command', () => {
    commitAll(base, 'init');
    const receipt = makeReceipt({ cmd: 'unknown-tool do-thing' });

    const results = detectIntegrationRoughPoints([receipt], [], makeMining(), { base });
    const pe001 = results.find(r => r.code === 'PE-001')!;
    expect(pe001.passed).toBe(false);
    expect(pe001.evidence[0]).toContain('Unregistered');
  });

  it('all pass on clean fixture', () => {
    commitAll(base, 'init');
    writeFileSync(join(base, '.roadmap', 'git-state.json'), JSON.stringify({ activePlan: 'test-dag' }));
    writeFileSync(join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), '{}');
    commitAll(base, 'setup');
    // Update receipt to match current HEAD
    const sha = headSha(base);
    writeFileSync(join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), JSON.stringify({ headSha: sha }));

    const receipt = makeReceipt({ cmd: 'mf ask something' });
    const results = detectIntegrationRoughPoints([receipt], [], makeMining(), { base });
    expect(results.every(r => r.passed)).toBe(true);
  });

  it('returns 6 detectors total', () => {
    commitAll(base, 'init');
    const results = detectIntegrationRoughPoints([], [], makeMining(), { base });
    expect(results).toHaveLength(6);
    expect(results.map(r => r.code).sort()).toEqual(['IR-001', 'IR-002', 'IR-003', 'IR-004', 'IR-005', 'PE-001']);
  });
});
