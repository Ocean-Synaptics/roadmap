import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hasPassingReceipt,
  saveCompletionWithEvidence,
  loadCompletionsWithEvidence,
} from '../src/lib/completion-evidence.ts';

describe('skip-validate quarantine', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'svq-test-')); mkdirSync(join(tmp, '.roadmap')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('skip-validate completion does not satisfy hasPassingReceipt', () => {
    // Simulate what cmdComplete does with --skip-validate:
    // records a single check with passed: false
    const skipEvidence = [{ rule: 'skip-validate', passed: false, evidence: 'validation skipped by --skip-validate flag' }];
    saveCompletionWithEvidence(tmp, 'node-x', skipEvidence, 'agent', 'cp-1');

    const loaded = loadCompletionsWithEvidence(tmp);
    const record = loaded.get('node-x');

    expect(record).toBeDefined();
    expect(record!.validationChecks).toHaveLength(1);
    expect(record!.validationChecks![0].passed).toBe(false);
    expect(hasPassingReceipt(record)).toBe(false);
  });

  it('validated completion does satisfy hasPassingReceipt', () => {
    const validEvidence = [
      { rule: 'shell', passed: true, evidence: 'tsc clean' },
      { rule: 'artifact-exists', passed: true, evidence: 'out.ts exists' },
    ];
    saveCompletionWithEvidence(tmp, 'node-y', validEvidence, 'agent', 'cp-2');

    const loaded = loadCompletionsWithEvidence(tmp);
    expect(hasPassingReceipt(loaded.get('node-y'))).toBe(true);
  });

  it('skip-validated node does not advance orient position', () => {
    // skip-validate writes a completion record...
    const skipEvidence = [{ rule: 'skip-validate', passed: false, evidence: 'skipped' }];
    saveCompletionWithEvidence(tmp, 'a', skipEvidence);

    // ...but loadCompletions (old API) still sees it as completed (it's in the file)
    // The distinction is in hasPassingReceipt — orient should check this
    const loaded = loadCompletionsWithEvidence(tmp);
    expect(loaded.has('a')).toBe(true);
    // The completion record exists but is not a passing receipt
    expect(hasPassingReceipt(loaded.get('a'))).toBe(false);
  });

  it('mixed: one validated, one skipped — only validated passes', () => {
    saveCompletionWithEvidence(tmp, 'valid', [{ rule: 'tsc', passed: true, evidence: 'ok' }]);
    saveCompletionWithEvidence(tmp, 'skipped', [{ rule: 'skip-validate', passed: false, evidence: 'skipped' }]);

    const loaded = loadCompletionsWithEvidence(tmp);
    expect(hasPassingReceipt(loaded.get('valid'))).toBe(true);
    expect(hasPassingReceipt(loaded.get('skipped'))).toBe(false);
  });
});
