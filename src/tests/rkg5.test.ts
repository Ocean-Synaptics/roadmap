// RKG-5 adversarial fixture suite
// Covers: guard registry, orphan statement, CheckSet rollback, candidate receipts,
//         pareto front stability under quantization, GalleryFailure routing
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GuardRegistry, blendWithPolicy } from '../lib/blend-policy.ts';
import type { BlendPolicyConfig } from '../lib/blend-policy.ts';
import type { GuardResult } from '../lib/blend-receipt.ts';
import { blendCandidates } from '../lib/blend.ts';
import type { BlendSpec } from '../lib/blend.ts';
import type { CandidateResult, FileToIntents } from '../lib/emit-gallery.ts';
import { runGallery } from '../lib/emit-gallery.ts';
import type { EmitGalleryNodeSpec } from '../protocol.ts';
import { computeParetoFront, DEFAULT_QUANTIZATION } from '../lib/gallery.ts';
import type { CandidateMetrics, QuantizationConfig } from '../lib/gallery.ts';

// -- Helpers --

function mkCandidate(id: string, overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    id,
    strategy: id,
    files: {},
    deterministic: {
      tsc: { pass: true },
      vitest: { pass: true, passed: 1, failed: 0, coverage: 80 },
      build: { pass: true },
    },
    intent: [],
    summary: {
      loc: 100,
      fileCount: 3,
      deterministicPass: true,
      intentScore: '1/1',
      estimatedCost: 1.0,
    },
    ...overrides,
  };
}

function mkNodeSpec(overrides: Partial<EmitGalleryNodeSpec> = {}): EmitGalleryNodeSpec {
  return {
    id: 'test-node',
    nodeType: 'emit-gallery',
    candidates: 3,
    strategies: ['faithful', 'minimal', 'robust'],
    selectionMode: 'auto',
    validate: [],
    produces: ['out.ts'],
    ...overrides,
  };
}

// -- 1. Guard Registry: unknown guard = hard error --

describe('RKG-5: guard registry — unknown guard is hard error', () => {
  let registry: GuardRegistry;

  beforeEach(() => {
    registry = new GuardRegistry();
    registry.register('cost-cap', () => ({ guardName: 'cost-cap', passed: true }));
  });

  it('runOne throws on unknown guard name', () => {
    expect(() => registry.runOne('nonexistent', {})).toThrow(/unknown guard 'nonexistent'/i);
  });

  it('blendWithPolicy throws when policy references unregistered guard', () => {
    const policy: BlendPolicyConfig = {
      guards: [{ name: 'cost-cap' }, { name: 'phantom-guard' }],
    };
    expect(() => blendWithPolicy(registry, policy, {})).toThrow(/unknown guard.*"phantom-guard"/i);
  });

  it('register rejects duplicate guard name', () => {
    expect(() => registry.register('cost-cap', () => ({ guardName: 'x', passed: true }))).toThrow(/already registered/i);
  });

  it('run succeeds when all guards are registered', () => {
    registry.register('lint-check', (_input, _params) => ({ guardName: 'lint-check', passed: true }));
    const policy: BlendPolicyConfig = { guards: [{ name: 'cost-cap' }, { name: 'lint-check' }] };
    const result = blendWithPolicy(registry, policy, {});
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('required guard failure produces error string', () => {
    registry.register('strict', () => ({ guardName: 'strict', passed: false, evidence: 'too expensive' }));
    const policy: BlendPolicyConfig = { guards: [{ name: 'strict', required: true }] };
    const result = blendWithPolicy(registry, policy, {});
    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('strict');
  });
});

// -- 2. Orphan statement rejection --

describe('RKG-5: orphan statement rejection in blend', () => {
  it('throws when primary candidate not found', () => {
    const candidates = [mkCandidate('alpha')];
    const spec: BlendSpec = { primary: 'ghost', donors: [] };
    expect(() => blendCandidates(candidates, spec, {})).toThrow(/primary candidate 'ghost' not found/i);
  });

  it('skips donor files without intent coverage (conservative)', () => {
    const primary = mkCandidate('primary', {
      files: { 'src/a.ts': 'long content here abcdef' },
    });
    const donor = mkCandidate('donor', {
      files: { 'src/a.ts': 'short' }, // cheaper but no intent coverage
    });
    const fileToIntents: FileToIntents = {}; // no coverage for src/a.ts
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);
    // Should NOT substitute — no intent coverage
    expect(result.substitutions).toHaveLength(0);
    expect(result.files['src/a.ts']).toBe('long content here abcdef');
  });

  it('skips donor when it fails a covering intent statement', () => {
    const primary = mkCandidate('primary', {
      files: { 'src/a.ts': 'long primary content' },
      intent: [{ statement: 'must be correct', pass: true, confidence: 0.95, reasoning: '', evidence: [] }],
    });
    const donor = mkCandidate('donor', {
      files: { 'src/a.ts': 'short' },
      intent: [{ statement: 'must be correct', pass: false, confidence: 0.3, reasoning: 'wrong', evidence: [] }],
    });
    const fileToIntents: FileToIntents = { 'src/a.ts': ['must be correct'] };
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);
    expect(result.substitutions).toHaveLength(0);
  });
});

// -- 3. CheckSet rollback evidence on failure --

describe('RKG-5: CheckSet rollback evidence', () => {
  it('records rollback evidence when deterministic check fails after substitution', () => {
    const primary = mkCandidate('primary', {
      files: { 'src/a.ts': 'primary content long enough' },
      intent: [{ statement: 'stmt-A', pass: true, confidence: 0.95, reasoning: '', evidence: [] }],
    });
    const donor = mkCandidate('donor', {
      files: { 'src/a.ts': 'short' },
      intent: [{ statement: 'stmt-A', pass: true, confidence: 0.99, reasoning: '', evidence: [] }],
    });
    const fileToIntents: FileToIntents = { 'src/a.ts': ['stmt-A'] };

    const result = blendCandidates(
      [primary, donor],
      { primary: 'primary', donors: ['donor'] },
      fileToIntents,
      { deterministicCheck: () => false }, // always fails
    );

    expect(result.reverted).toHaveLength(1);
    expect(result.reverted[0].path).toBe('src/a.ts');
    expect(result.reverted[0].reason).toContain('broke deterministic gate');
    expect(result.checkSet.allPassed).toBe(false);
    expect(result.checkSet.checks.some(c => c.status === 'fail' && c.rollbackEvidence !== undefined)).toBe(true);
    // File should be reverted to primary content
    expect(result.files['src/a.ts']).toBe('primary content long enough');
  });

  it('writes rollback evidence to disk when blendId + repoRoot provided', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg5-rollback-'));
    try {
      const primary = mkCandidate('primary', {
        files: { 'src/x.ts': 'primary content is longer' },
        intent: [{ statement: 's1', pass: true, confidence: 0.9, reasoning: '', evidence: [] }],
      });
      const donor = mkCandidate('donor', {
        files: { 'src/x.ts': 'short' },
        intent: [{ statement: 's1', pass: true, confidence: 0.9, reasoning: '', evidence: [] }],
      });

      blendCandidates(
        [primary, donor],
        { primary: 'primary', donors: ['donor'] },
        { 'src/x.ts': ['s1'] },
        { deterministicCheck: () => false, blendId: 'test-blend-1', repoRoot: tmp },
      );

      const rollbackDir = join(tmp, '.roadmap', 'blend-rollbacks', 'test-blend-1');
      expect(existsSync(rollbackDir)).toBe(true);
      const files = require('node:fs').readdirSync(rollbackDir);
      expect(files.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// -- 4. Candidate receipt per candidate --

describe('RKG-5: candidate receipt per candidate', () => {
  it('writes one receipt per candidate when repoRoot provided', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg5-receipts-'));
    try {
      const candidates = [
        mkCandidate('c-alpha'),
        mkCandidate('c-beta'),
        mkCandidate('c-gamma'),
      ];
      const nodeSpec = mkNodeSpec({ validate: [] });

      const result = await runGallery({
        nodeSpec,
        strategies: [],
        workDir: tmp,
        _candidates: candidates,
        repoRoot: tmp,
      });

      expect(result.ok).toBe(true);
      const receiptsDir = join(tmp, '.roadmap', 'receipts');
      expect(existsSync(receiptsDir)).toBe(true);

      for (const c of candidates) {
        const receiptPath = join(receiptsDir, `candidate-${c.id}.json`);
        expect(existsSync(receiptPath)).toBe(true);
        const receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));
        expect(receipt.candidateId).toBe(c.id);
        expect(receipt.sourceNodeId).toBe(nodeSpec.id);
        expect(receipt.pipelineSteps).toContain('strategy-select');
        expect(receipt.producedAt).toBeTruthy();
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// -- 5. Pareto front stable under noise quantization --

describe('RKG-5: pareto front stability under quantization', () => {
  it('quantization collapses near-identical candidates to same front position', () => {
    const metrics: CandidateMetrics[] = [
      { candidateId: 'a', coverage: 0.901, cost: 1.004, latency: 50.3 },
      { candidateId: 'b', coverage: 0.899, cost: 0.996, latency: 49.7 },
    ];
    // With default quantization (coverage 0.01, cost 0.01, latency 1.0):
    // a: coverage=0.90, cost=1.00, latency=50
    // b: coverage=0.90, cost=1.00, latency=50
    // Neither dominates → both on front
    const report = computeParetoFront(metrics);
    expect(report.paretoFront).toHaveLength(2);
    expect(report.dominated).toHaveLength(0);
  });

  it('without quantization, noise separates candidates that are functionally equal', () => {
    const metrics: CandidateMetrics[] = [
      { candidateId: 'a', coverage: 0.901, cost: 1.004, latency: 50.3 },
      { candidateId: 'b', coverage: 0.901, cost: 1.003, latency: 50.3 }, // b is strictly cheaper
    ];
    // With very fine quantization, b dominates a (same coverage+latency, lower cost)
    const fine: QuantizationConfig = { coverageBinSize: 0.0001, costBinSize: 0.0001, latencyBinSize: 0.01 };
    const report = computeParetoFront(metrics, undefined, fine);
    expect(report.paretoFront).toHaveLength(1);
    expect(report.paretoFront[0].candidateId).toBe('b');
    expect(report.dominated).toHaveLength(1);
  });

  it('clearly dominated candidate is filtered regardless of quantization', () => {
    const metrics: CandidateMetrics[] = [
      { candidateId: 'good', coverage: 0.95, cost: 0.50, latency: 10 },
      { candidateId: 'bad', coverage: 0.80, cost: 2.00, latency: 100 },
    ];
    const report = computeParetoFront(metrics);
    expect(report.paretoFront).toHaveLength(1);
    expect(report.paretoFront[0].candidateId).toBe('good');
    expect(report.dominated[0].candidateId).toBe('bad');
  });

  it('pareto front never returns empty set', () => {
    const metrics: CandidateMetrics[] = [
      { candidateId: 'x', coverage: 0.5, cost: 1.0, latency: 50 },
    ];
    const report = computeParetoFront(metrics);
    expect(report.paretoFront.length).toBeGreaterThan(0);
  });

  it('report includes sha and quantization config', () => {
    const metrics: CandidateMetrics[] = [
      { candidateId: 'sole', coverage: 0.9, cost: 1.0, latency: 30 },
    ];
    const report = computeParetoFront(metrics);
    expect(report.sha).toBeTruthy();
    expect(report.quantization).toEqual(DEFAULT_QUANTIZATION);
  });
});

// -- 6. GalleryFailure routing — each failure type carries evidence --

describe('RKG-5: GalleryFailure routing', () => {
  it('insufficientCandidates when zero candidates', async () => {
    const result = await runGallery({
      nodeSpec: mkNodeSpec({ candidates: 3 }),
      strategies: [],
      workDir: '/tmp',
      _candidates: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('insufficientCandidates');
      expect(result.evidence.candidatesEvaluated).toBe(0);
      expect(result.reason).toContain('no candidates');
    }
  });

  it('paretoEmpty when all candidates fail deterministic gates', async () => {
    const candidates = [
      mkCandidate('c1', { summary: { loc: 10, fileCount: 1, deterministicPass: false, intentScore: '0/1', estimatedCost: 1 } }),
      mkCandidate('c2', { summary: { loc: 10, fileCount: 1, deterministicPass: false, intentScore: '0/1', estimatedCost: 1 } }),
    ];
    const result = await runGallery({
      nodeSpec: mkNodeSpec({ validate: [] }),
      strategies: [],
      workDir: '/tmp',
      _candidates: candidates,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('paretoEmpty');
      expect(result.evidence.candidatesEvaluated).toBe(2);
      expect(result.evidence.candidateIds).toEqual(['c1', 'c2']);
      expect(result.reason).toContain('pareto front empty');
    }
  });

  it('guardRejection when all candidates fail same intent', async () => {
    const candidates = [
      mkCandidate('c1', {
        intent: [{ statement: 'must compile', pass: false, confidence: 0.3, reasoning: 'syntax errors', evidence: [] }],
      }),
      mkCandidate('c2', {
        intent: [{ statement: 'must compile', pass: false, confidence: 0.4, reasoning: 'type errors', evidence: [] }],
      }),
    ];
    const result = await runGallery({
      nodeSpec: mkNodeSpec({
        validate: [{ type: 'intent', statement: 'must compile', confidence: 0.9, evaluator: 'self' }],
      }),
      strategies: [],
      workDir: '/tmp',
      _candidates: candidates,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.failures).toHaveLength(1);
      const f = result.data.failures[0];
      expect(f.code).toBe('guardRejection');
      expect(f.ok).toBe(false);
      expect(f.evidence.guardName).toBe('must compile');
      expect(f.evidence.checkFailed).toContain('0.40');
      expect(f.evidence.checkFailed).toContain('0.9');
      expect(f.evidence.candidatesEvaluated).toBe(2);
      expect(f.evidence.candidateIds).toEqual(['c1', 'c2']);
    }
  });

  it('success path returns ok: true with full GalleryRunResult', async () => {
    const candidates = [
      mkCandidate('winner', {
        intent: [{ statement: 'works', pass: true, confidence: 0.95, reasoning: 'all good', evidence: [] }],
      }),
    ];
    const result = await runGallery({
      nodeSpec: mkNodeSpec({ validate: [] }),
      strategies: [],
      workDir: '/tmp',
      _candidates: candidates,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.candidates).toHaveLength(1);
      expect(result.data.survivors).toHaveLength(1);
      expect(result.data.intentSurvivors).toHaveLength(1);
      expect(result.data.scorecard).toContain('winner');
    }
  });

  it('mixed pass/fail intent does NOT produce guardRejection', async () => {
    const candidates = [
      mkCandidate('c1', {
        intent: [{ statement: 'stmt-X', pass: true, confidence: 0.95, reasoning: '', evidence: [] }],
      }),
      mkCandidate('c2', {
        intent: [{ statement: 'stmt-X', pass: false, confidence: 0.3, reasoning: '', evidence: [] }],
      }),
    ];
    const result = await runGallery({
      nodeSpec: mkNodeSpec({ validate: [] }),
      strategies: [],
      workDir: '/tmp',
      _candidates: candidates,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.failures).toHaveLength(0);
    }
  });
});
