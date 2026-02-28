/**
 * plan-selection tests: type guards, path helpers, receipt write/load,
 * computeHeadSha, validatePlanSelection (PLAN_NOT_SELECTED, PLAN_INVALIDATED),
 * pointer round-trip, pointerValid.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isPlanSelectReceipt,
  isPlanSelectedPointer,
  planSelectReceiptPath,
  PLAN_SELECT_RECEIPT_DIR,
  PLAN_SELECTED_POINTER,
  writePlanSelectReceipt,
  loadPlanSelectReceipt,
  computeHeadSha,
  validatePlanSelection,
} from '../src/lib/plan-selection.ts';
import { readPointer, writePointer, pointerValid } from '../src/lib/receipts/plan-selected-pointer.ts';
import type { PlanSelectReceipt, PlanSelectedPointer } from '../src/lib/plan-selection.ts';

// ── isPlanSelectReceipt ──────────────────────────────────────────────────────

describe('isPlanSelectReceipt', () => {
  const valid: PlanSelectReceipt = {
    schemaVersion: 1,
    type: 'plan-select',
    headSha: 'abc123def456',
    candidateId: 'plan-v1',
    timestamp: '2026-02-28T00:00:00.000Z',
    note: 'selected for clarity',
  };

  it('accepts a valid receipt', () => {
    expect(isPlanSelectReceipt(valid)).toBe(true);
  });

  it('accepts a receipt with optional selectedBy', () => {
    expect(isPlanSelectReceipt({ ...valid, selectedBy: 'agent-a' })).toBe(true);
  });

  it('rejects null', () => {
    expect(isPlanSelectReceipt(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isPlanSelectReceipt('string')).toBe(false);
    expect(isPlanSelectReceipt(42)).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    expect(isPlanSelectReceipt({ ...valid, schemaVersion: 2 })).toBe(false);
  });

  it('rejects wrong type field', () => {
    expect(isPlanSelectReceipt({ ...valid, type: 'other' })).toBe(false);
  });

  it('rejects missing headSha', () => {
    const { headSha: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing candidateId', () => {
    const { candidateId: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing note', () => {
    const { note: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects non-string selectedBy', () => {
    expect(isPlanSelectReceipt({ ...valid, selectedBy: 123 })).toBe(false);
  });
});

// ── isPlanSelectedPointer ────────────────────────────────────────────────────

describe('isPlanSelectedPointer', () => {
  const valid: PlanSelectedPointer = {
    receiptPath: '.roadmap/receipts/plan-select-abc123.json',
    headSha: 'abc123def456',
    candidateId: 'plan-v1',
    timestamp: '2026-02-28T00:00:00.000Z',
  };

  it('accepts a valid pointer', () => {
    expect(isPlanSelectedPointer(valid)).toBe(true);
  });

  it('rejects null', () => {
    expect(isPlanSelectedPointer(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isPlanSelectedPointer('string')).toBe(false);
  });

  it('rejects missing receiptPath', () => {
    const { receiptPath: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing headSha', () => {
    const { headSha: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing candidateId', () => {
    const { candidateId: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });
});

// ── planSelectReceiptPath ────────────────────────────────────────────────────

describe('planSelectReceiptPath', () => {
  it('uses first 12 chars of headSha', () => {
    const sha = 'abcdef123456789full';
    const path = planSelectReceiptPath(sha);
    expect(path).toBe('.roadmap/receipts/plan-select-abcdef123456.json');
  });

  it('prefixes with PLAN_SELECT_RECEIPT_DIR', () => {
    const path = planSelectReceiptPath('aabbccddeeff');
    expect(path.startsWith(PLAN_SELECT_RECEIPT_DIR)).toBe(true);
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('PLAN_SELECT_RECEIPT_DIR', () => {
    expect(PLAN_SELECT_RECEIPT_DIR).toBe('.roadmap/receipts');
  });

  it('PLAN_SELECTED_POINTER', () => {
    expect(PLAN_SELECTED_POINTER).toBe('.roadmap/PLAN_SELECTED.json');
  });
});

// ── Functional: receipt write/load, validation, pointer ─────────────────────

function writeMinimalHead(repoRoot: string, content?: object): void {
  const dag = content ?? {
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init', desc: 's', produces: [], consumes: [], deps: [] },
      term: { id: 'term', desc: 'e', produces: [], consumes: [], deps: ['init'] },
    },
  };
  writeFileSync(join(repoRoot, '.roadmap', 'head.json'), JSON.stringify(dag));
}

describe('plan-selection functional', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'plan-sel-fn-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- computeHeadSha ---

  it('computeHeadSha returns consistent 64-char hex', () => {
    writeMinimalHead(tmp);
    const sha1 = computeHeadSha(tmp);
    const sha2 = computeHeadSha(tmp);
    expect(sha1).toBe(sha2);
    expect(sha1).toHaveLength(64);
  });

  it('computeHeadSha throws when head.json missing', () => {
    expect(() => computeHeadSha(tmp)).toThrow();
  });

  // --- writePlanSelectReceipt + loadPlanSelectReceipt ---

  it('writePlanSelectReceipt creates receipt and PLAN_SELECTED.json pointer', () => {
    writeMinimalHead(tmp);
    const receipt = writePlanSelectReceipt(tmp, 'candidate-alpha', 'test-agent', { note: 'test' });

    expect(receipt.type).toBe('plan-select');
    expect(receipt.candidateId).toBe('candidate-alpha');
    expect(receipt.selector).toBe('test-agent');
    expect(receipt.headSha).toBe(computeHeadSha(tmp));

    const pointerPath = join(tmp, '.roadmap', 'receipts', 'PLAN_SELECTED.json');
    expect(existsSync(pointerPath)).toBe(true);
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf-8'));
    expect(pointer.candidateId).toBe('candidate-alpha');
  });

  it('loadPlanSelectReceipt returns the written receipt', () => {
    writeMinimalHead(tmp);
    writePlanSelectReceipt(tmp, 'c1', 'agent');
    const loaded = loadPlanSelectReceipt(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded!.candidateId).toBe('c1');
  });

  it('loadPlanSelectReceipt returns null when no receipt exists', () => {
    writeMinimalHead(tmp);
    expect(loadPlanSelectReceipt(tmp)).toBeNull();
  });

  // --- validatePlanSelection ---

  it('validatePlanSelection valid when receipt matches current head', () => {
    writeMinimalHead(tmp);
    writePlanSelectReceipt(tmp, 'c1', 'agent');
    const result = validatePlanSelection(tmp);
    expect(result.valid).toBe(true);
    expect(result.receipt).toBeDefined();
  });

  it('validatePlanSelection PLAN_NOT_SELECTED when no receipt', () => {
    writeMinimalHead(tmp);
    const result = validatePlanSelection(tmp);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/No plan selected/i);
  });

  it('validatePlanSelection PLAN_INVALIDATED after head.json mutation', () => {
    writeMinimalHead(tmp);
    writePlanSelectReceipt(tmp, 'c1', 'agent');

    // Mutate head.json → headSha changes → receipt stale
    writeMinimalHead(tmp, {
      id: 'mutated', desc: 'changed', init: 'init', term: 'term',
      nodes: {
        init: { id: 'init', desc: 's', produces: [], consumes: [], deps: [] },
        term: { id: 'term', desc: 'e', produces: [], consumes: [], deps: ['init'] },
      },
    });

    const result = validatePlanSelection(tmp);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/stale/i);
    expect(result.receipt).toBeDefined();
  });

  // --- Pointer module ---

  it('readPointer returns null when no pointer file', () => {
    expect(readPointer(tmp)).toBeNull();
  });

  it('writePointer + readPointer round-trips', () => {
    const ptr = { receipt: 'plan-select-abc.json', headSha: 'deadbeef', candidateId: 'c2' };
    writePointer(tmp, ptr);
    const loaded = readPointer(tmp);
    expect(loaded).toEqual(ptr);
  });

  it('pointerValid returns invalid when headSha mismatches', () => {
    writeMinimalHead(tmp);
    writePointer(tmp, { receipt: 'r.json', headSha: 'wrong-sha', candidateId: 'c1' });
    const result = pointerValid(tmp);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mismatch/i);
  });

  it('pointerValid returns valid when headSha matches', () => {
    writeMinimalHead(tmp);
    const sha = computeHeadSha(tmp);
    writePointer(tmp, { receipt: 'r.json', headSha: sha, candidateId: 'c1' });
    const result = pointerValid(tmp);
    expect(result.valid).toBe(true);
  });
});
