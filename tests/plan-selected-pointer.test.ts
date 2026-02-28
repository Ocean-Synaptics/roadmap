import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { readPointer, writePointer, pointerValid } from '../src/lib/receipts/plan-selected-pointer.ts';
import type { PlanSelectedPointer } from '../src/lib/receipts/plan-selected-pointer.ts';

let tmpDir: string;
const minimalDag = { id: 'test-dag', desc: 'test', init: 'a', term: 'b', nodes: {} };

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'plan-selected-pointer-'));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(minimalDag, null, 2));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writePointer + readPointer', () => {
  it('round-trips a pointer through PLAN_SELECTED.json', () => {
    const pointer: PlanSelectedPointer = {
      receipt: 'plan-select-abc123.json',
      headSha: 'deadbeef'.repeat(8),
      candidateId: 'aggressive',
    };
    writePointer(tmpDir, pointer);
    const loaded = readPointer(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.receipt).toBe(pointer.receipt);
    expect(loaded!.headSha).toBe(pointer.headSha);
    expect(loaded!.candidateId).toBe(pointer.candidateId);
  });
});

describe('readPointer', () => {
  it('returns null when PLAN_SELECTED.json is absent', () => {
    expect(readPointer(tmpDir)).toBeNull();
  });

  it('returns null when PLAN_SELECTED.json is malformed JSON', () => {
    mkdirSync(join(tmpDir, '.roadmap', 'receipts'), { recursive: true });
    writeFileSync(join(tmpDir, '.roadmap', 'receipts', 'PLAN_SELECTED.json'), 'not json');
    expect(readPointer(tmpDir)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    mkdirSync(join(tmpDir, '.roadmap', 'receipts'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.roadmap', 'receipts', 'PLAN_SELECTED.json'),
      JSON.stringify({ receipt: 'foo.json' }),
    );
    expect(readPointer(tmpDir)).toBeNull();
  });
});

describe('pointerValid', () => {
  it('returns valid when pointer headSha matches current head.json', () => {
    // Write head.json, compute its sha, write a pointer with that sha
    const headBytes = readFileSync(join(tmpDir, '.roadmap', 'head.json'));
    const sha = createHash('sha256').update(headBytes).digest('hex');

    writePointer(tmpDir, { receipt: 'plan-select-abc.json', headSha: sha, candidateId: 'budget' });
    const result = pointerValid(tmpDir);
    expect(result.valid).toBe(true);
    expect(result.pointer!.candidateId).toBe('budget');
  });

  it('returns invalid when headSha mismatches after head.json mutation', () => {
    const headBytes = readFileSync(join(tmpDir, '.roadmap', 'head.json'));
    const sha = createHash('sha256').update(headBytes).digest('hex');

    writePointer(tmpDir, { receipt: 'plan-select-abc.json', headSha: sha, candidateId: 'budget' });
    // Mutate head.json
    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify({ ...minimalDag, desc: 'mutated' }, null, 2));

    const result = pointerValid(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/mismatch/);
    expect(result.pointer).toBeDefined();
  });

  it('returns invalid when pointer is missing', () => {
    const result = pointerValid(tmpDir);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing/);
  });
});
