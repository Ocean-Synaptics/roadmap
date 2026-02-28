import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  writePlanSelectReceipt,
  loadPlanSelectReceipt,
  computeHeadSha,
  validatePlanSelection,
} from '../src/lib/receipts/plan-select.ts';

let tmpDir: string;
const minimalDag = { id: 'test-dag', desc: 'test', init: 'a', term: 'b', nodes: {} };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-select-'));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('computeHeadSha', () => {
  it('returns sha256 of head.json bytes', () => {
    const sha = computeHeadSha(tmpDir);
    const expected = createHash('sha256')
      .update(readFileSync(join(tmpDir, '.roadmap', 'head.json')))
      .digest('hex');
    expect(sha).toBe(expected);
  });

  it('throws when head.json missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-head-'));
    expect(() => computeHeadSha(empty)).toThrow('No .roadmap/head.json');
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('writePlanSelectReceipt', () => {
  it('writes receipt and PLAN_SELECTED pointer', () => {
    const receipt = writePlanSelectReceipt(tmpDir, 'aggressive', 'user-1', { note: 'test selection' });
    expect(receipt.type).toBe('plan-select');
    expect(receipt.candidateId).toBe('aggressive');
    expect(receipt.selector).toBe('user-1');
    expect(receipt.note).toBe('test selection');
    expect(receipt.headSha).toBeTruthy();

    const pointer = JSON.parse(readFileSync(join(tmpDir, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), 'utf-8'));
    expect(pointer.candidateId).toBe('aggressive');
    expect(pointer.headSha).toBe(receipt.headSha);
    expect(existsSync(join(tmpDir, '.roadmap', 'receipts', pointer.receipt))).toBe(true);
  });

  it('omits galleryHash and note when not provided', () => {
    const receipt = writePlanSelectReceipt(tmpDir, 'budget', 'agent-1');
    expect(receipt.galleryHash).toBeUndefined();
    expect(receipt.note).toBeUndefined();
  });
});

describe('loadPlanSelectReceipt', () => {
  it('loads receipt via PLAN_SELECTED pointer', () => {
    writePlanSelectReceipt(tmpDir, 'aggressive', 'user-1');
    const loaded = loadPlanSelectReceipt(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.candidateId).toBe('aggressive');
  });

  it('returns null when no pointer exists', () => {
    expect(loadPlanSelectReceipt(tmpDir)).toBeNull();
  });
});

describe('validatePlanSelection', () => {
  it('valid when receipt matches current headSha', () => {
    writePlanSelectReceipt(tmpDir, 'aggressive', 'user-1');
    const result = validatePlanSelection(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.receipt!.candidateId).toBe('aggressive');
  });

  it('invalid when no receipt exists', () => {
    const result = validatePlanSelection(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/No plan selected/);
  });

  it('invalid when head.json changed after selection (sha mismatch)', () => {
    writePlanSelectReceipt(tmpDir, 'aggressive', 'user-1');
    // Mutate head.json
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ ...minimalDag, desc: 'mutated' }, null, 2));
    const result = validatePlanSelection(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/stale/);
  });

  it('re-selection after mutation restores validity', () => {
    writePlanSelectReceipt(tmpDir, 'aggressive', 'user-1');
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ ...minimalDag, desc: 'mutated' }, null, 2));
    expect(validatePlanSelection(tmpDir).valid).toBe(false);

    // Re-select
    writePlanSelectReceipt(tmpDir, 'budget', 'user-1');
    const result = validatePlanSelection(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.receipt!.candidateId).toBe('budget');
  });
});
