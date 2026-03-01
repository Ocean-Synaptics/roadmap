import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { requireRunId } from '../../src/lib/sgk/cli/run-enforce.ts';
import { checkDispatchGates } from '../../src/lib/sgk/cli/dispatch-gates.ts';
import { bindNodeToRun } from '../../src/lib/sgk/cli/complete-binding.ts';
import { checkCloseGates } from '../../src/lib/sgk/cli/close-gates.ts';
import { runInitIntent } from '../../src/lib/sgk/cli/intent-init.ts';
import { runTermIntent } from '../../src/lib/sgk/cli/intent-term.ts';
import { checkIntentBinding } from '../../src/lib/sgk/intent-binding.ts';
import { mineRun } from '../../src/lib/sgk/mine.ts';
import { auditRun } from '../../src/lib/sgk/audit.ts';
import { detectStrategyIgnorance } from '../../src/lib/sgk/detectors/strategy.ts';
import { detectChainBreak } from '../../src/lib/sgk/detectors/chain.ts';
import { writeDisplay } from '../../src/lib/sgk/display.ts';
import { checkTermDisplayRequirement } from '../../src/lib/sgk/term-display-check.ts';
import { writeStrategyReceipt } from '../../src/lib/sgk/receipts/strategy.ts';
import { writePlanReceipt } from '../../src/lib/sgk/receipts/plan.ts';
import { writeIntentReceipt } from '../../src/lib/sgk/receipts/intent.ts';
import { writeMineReceipt } from '../../src/lib/sgk/receipts/mine.ts';
import { writeAuditReceipt } from '../../src/lib/sgk/receipts/audit.ts';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `sgk-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const roadmapDir = join(dir, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'kernel.json'), JSON.stringify({ requireRunId: false }));
  return dir;
}

const RUN_ID = 'test-run-001';
const T_EARLY = '2020-01-01T00:00:00.000Z';
const T_LATE = '2030-01-01T00:00:00.000Z';

function writeTestStrategyReceipt(root: string, selectedAt?: string) {
  writeStrategyReceipt(root, {
    schema_version: 1, type: 'strategy-selection', runId: RUN_ID,
    selectionMode: 'manual', strategyId: 'validate-as-you-go',
    strategyConfigSha: 'abc123', constraints: [],
    selectedAt: selectedAt ?? new Date().toISOString(),
  });
}

function writeTestPlanReceipt(root: string, selectedAt?: string) {
  writePlanReceipt(root, {
    schema_version: 1, type: 'plan-selection', runId: RUN_ID,
    planId: 'plan-001', candidateSetDigest: 'digest-abc', bindingSha: 'bind-sha-001',
    selectedAt: selectedAt ?? new Date().toISOString(),
  });
}

function writeTestInitIntent(root: string, evaluatedAt?: string) {
  writeIntentReceipt(root, {
    schema_version: 1, type: 'intent-gate', gate: 'init', runId: RUN_ID,
    statements: [{ statement: 'ok', threshold: 1, confidence: 1, pass: true }],
    overallPass: true, policyFlags: { allowUnevaluated: false, expandOnFail: false },
    evaluatedAt: evaluatedAt ?? new Date().toISOString(),
  });
}

// ── requireRunId ─────────────────────────────────────────────────────────────

describe('requireRunId', () => {
  it('permissive when kernel.requireRunId=false', () => {
    const root = makeTmpDir();
    const result = requireRunId(root, []);
    expect(result.ok).toBe(true);
  });

  it('blocks when requireRunId=true and no arg', () => {
    const root = makeTmpDir();
    writeFileSync(join(root, '.roadmap', 'kernel.json'), JSON.stringify({ requireRunId: true }));
    const result = requireRunId(root, []);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('requireRunId');
  });
});

// ── checkDispatchGates ───────────────────────────────────────────────────────

describe('checkDispatchGates', () => {
  it('missing strategy receipt → STRATEGY_NOT_SELECTED', () => {
    const root = makeTmpDir();
    const result = checkDispatchGates(root, RUN_ID);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('STRATEGY_NOT_SELECTED');
  });

  it('all present → ok:true', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root);
    writeTestPlanReceipt(root);
    writeTestInitIntent(root);
    const result = checkDispatchGates(root, RUN_ID);
    expect(result.ok).toBe(true);
  });
});

// ── bindNodeToRun ────────────────────────────────────────────────────────────

describe('bindNodeToRun', () => {
  it('writes file at correct path with nodeId + completedAt + headSha', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root);
    const path = bindNodeToRun(root, RUN_ID, 'node-a');
    expect(existsSync(path)).toBe(true);
    const binding = JSON.parse(readFileSync(path, 'utf-8'));
    expect(binding.nodeId).toBe('node-a');
    expect(binding.completedAt).toBeDefined();
    expect(binding.headSha).toBeDefined();
  });
});

// ── checkCloseGates ──────────────────────────────────────────────────────────

describe('checkCloseGates', () => {
  it('missing term intent → blocked', () => {
    const root = makeTmpDir();
    const result = checkCloseGates(root, RUN_ID);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('TERM_INTENT_MISSING');
  });

  it('all present → ok:true', () => {
    const root = makeTmpDir();
    writeIntentReceipt(root, {
      schema_version: 1, type: 'intent-gate', gate: 'term', runId: RUN_ID,
      statements: [{ statement: 'ok', threshold: 1, confidence: 1, pass: true }],
      overallPass: true, policyFlags: { allowUnevaluated: false, expandOnFail: false },
      evaluatedAt: new Date().toISOString(),
    });
    writeMineReceipt(root, {
      schema_version: 1, type: 'mining', runId: RUN_ID,
      toolCallCounts: {}, latencyP50Ms: 0, latencyP95Ms: 0,
      hotspots: [], friction: [], minedAt: new Date().toISOString(),
    });
    writeAuditReceipt(root, {
      schema_version: 1, type: 'audit', runId: RUN_ID,
      verdicts: [{ check: 'test', pass: true }],
      overallPass: true, bypassUsage: [], auditedAt: new Date().toISOString(),
    });
    const result = checkCloseGates(root, RUN_ID);
    expect(result.ok).toBe(true);
  });
});

// ── runInitIntent ────────────────────────────────────────────────────────────

describe('runInitIntent', () => {
  it('missing strategy receipt → error', () => {
    const root = makeTmpDir();
    const result = runInitIntent(root, RUN_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('STRATEGY_NOT_SELECTED');
  });

  it('writes IntentGateReceipt(gate=init) when receipts present', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root);
    writeTestPlanReceipt(root);
    const result = runInitIntent(root, RUN_ID);
    expect(result.ok).toBe(true);
    expect(result.receiptPath).toBeDefined();
    expect(existsSync(result.receiptPath!)).toBe(true);
    const receipt = JSON.parse(readFileSync(result.receiptPath!, 'utf-8'));
    expect(receipt.gate).toBe('init');
  });
});

// ── runTermIntent ────────────────────────────────────────────────────────────

describe('runTermIntent', () => {
  it('missing init intent → error', () => {
    const root = makeTmpDir();
    const result = runTermIntent(root, RUN_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('INIT_INTENT_MISSING');
  });

  it('writes IntentGateReceipt(gate=term) when init passed', () => {
    const root = makeTmpDir();
    writeTestInitIntent(root);
    const result = runTermIntent(root, RUN_ID);
    expect(result.ok).toBe(true);
    expect(result.receiptPath).toBeDefined();
    const receipt = JSON.parse(readFileSync(result.receiptPath!, 'utf-8'));
    expect(receipt.gate).toBe('term');
  });
});

// ── checkIntentBinding ───────────────────────────────────────────────────────

describe('checkIntentBinding', () => {
  it('no drift when nothing changed', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root, T_EARLY);
    writeTestPlanReceipt(root, T_EARLY);
    writeTestInitIntent(root, T_LATE);
    const status = checkIntentBinding(root, RUN_ID);
    expect(status.bound).toBe(true);
    expect(status.driftDetected).toBe(false);
  });

  it('driftDetected when strategy re-selected after init', () => {
    const root = makeTmpDir();
    writeTestInitIntent(root, T_EARLY);
    writeTestStrategyReceipt(root, T_LATE);
    const status = checkIntentBinding(root, RUN_ID);
    expect(status.driftDetected).toBe(true);
    expect(status.details?.strategyChanged).toBe(true);
  });
});

// ── mineRun ──────────────────────────────────────────────────────────────────

describe('mineRun', () => {
  it('computes p50/p95 from durations and writes MiningReceipt', () => {
    const root = makeTmpDir();
    const path = mineRun({
      runId: RUN_ID, repoRoot: root,
      toolCallLog: [
        { tool: 'read', durationMs: 10, nodeId: 'n1' },
        { tool: 'read', durationMs: 50, nodeId: 'n1' },
        { tool: 'write', durationMs: 100, nodeId: 'n2' },
        { tool: 'read', durationMs: 200, nodeId: 'n3' },
      ],
    });
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, 'utf-8'));
    expect(receipt.type).toBe('mining');
    expect(receipt.toolCallCounts.read).toBe(3);
    expect(receipt.toolCallCounts.write).toBe(1);
    expect(receipt.latencyP50Ms).toBeGreaterThan(0);
    expect(receipt.latencyP95Ms).toBeGreaterThanOrEqual(receipt.latencyP50Ms);
    expect(receipt.hotspots.length).toBeGreaterThan(0);
  });
});

// ── auditRun ─────────────────────────────────────────────────────────────────

describe('auditRun', () => {
  it('calls detectors, writes AuditReceipt with overallPass', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root, T_EARLY);
    writeTestPlanReceipt(root, T_EARLY);
    writeTestInitIntent(root, T_LATE);
    const path = auditRun({ runId: RUN_ID, repoRoot: root });
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, 'utf-8'));
    expect(receipt.type).toBe('audit');
    expect(receipt.verdicts.length).toBe(2);
    expect(receipt.overallPass).toBe(true);
  });
});

// ── detectStrategyIgnorance ──────────────────────────────────────────────────

describe('detectStrategyIgnorance', () => {
  it('fails when no strategy receipt', () => {
    const root = makeTmpDir();
    const result = detectStrategyIgnorance(root, RUN_ID);
    expect(result.pass).toBe(false);
  });

  it('passes when strategy receipt present', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root);
    const result = detectStrategyIgnorance(root, RUN_ID);
    expect(result.pass).toBe(true);
  });
});

// ── detectChainBreak ─────────────────────────────────────────────────────────

describe('detectChainBreak', () => {
  it('no break when binding clean', () => {
    const root = makeTmpDir();
    writeTestStrategyReceipt(root, T_EARLY);
    writeTestPlanReceipt(root, T_EARLY);
    writeTestInitIntent(root, T_LATE);
    const result = detectChainBreak(root, RUN_ID);
    expect(result.pass).toBe(true);
  });

  it('break when drift detected', () => {
    const root = makeTmpDir();
    writeTestInitIntent(root, T_EARLY);
    writeTestStrategyReceipt(root, T_LATE);
    const result = detectChainBreak(root, RUN_ID);
    expect(result.pass).toBe(false);
    expect(result.evidence).toContain('strategy');
  });
});

// ── writeDisplay ─────────────────────────────────────────────────────────────

describe('writeDisplay', () => {
  it('writes DisplayReceipt at correct path', () => {
    const root = makeTmpDir();
    const path = writeDisplay({
      runId: RUN_ID, repoRoot: root, cmd: 'chart', humanMode: true,
      blocks: [{ type: 'chart', content: 'progress bar here' }],
    });
    expect(existsSync(path)).toBe(true);
    const receipt = JSON.parse(readFileSync(path, 'utf-8'));
    expect(receipt.type).toBe('display');
    expect(receipt.renderedBlocks).toHaveLength(1);
    expect(receipt.renderedBlocks[0].byteLength).toBeGreaterThan(0);
  });
});

// ── checkTermDisplayRequirement ──────────────────────────────────────────────

describe('checkTermDisplayRequirement', () => {
  it('satisfied when display receipt exists', () => {
    const root = makeTmpDir();
    writeDisplay({
      runId: RUN_ID, repoRoot: root, cmd: 'orient', humanMode: false,
      blocks: [{ type: 'json', content: '{}' }],
    });
    const result = checkTermDisplayRequirement(root, RUN_ID);
    expect(result.satisfied).toBe(true);
    expect(result.displayReceiptId).toBeDefined();
  });

  it('not satisfied when dir empty', () => {
    const root = makeTmpDir();
    const result = checkTermDisplayRequirement(root, RUN_ID);
    expect(result.satisfied).toBe(false);
  });
});
