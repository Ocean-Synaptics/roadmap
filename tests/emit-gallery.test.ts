import { describe, it, expect } from 'vitest';
import { buildFileToIntents, runGallery, type CandidateResult } from '../src/lib/emit-gallery.ts';
import { blendCandidates } from '../src/lib/blend.ts';
import { STRATEGIES, getStrategy } from '../src/lib/strategies/index.ts';
import type { ValidationRule, EmitGalleryNodeSpec } from '../src/protocol.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(
  id: string,
  files: Record<string, string>,
  intents: Array<{ statement: string; pass: boolean; confidence: number }>,
): CandidateResult {
  return {
    id,
    strategy: id,
    files,
    deterministic: { tsc: { pass: true }, vitest: { pass: true, passed: 5, failed: 0, coverage: 80 }, build: { pass: true } },
    intent: intents.map(i => ({ ...i, reasoning: 'test reasoning', evidence: [] })),
    summary: {
      loc: Object.values(files).join('').length,
      fileCount: Object.keys(files).length,
      deterministicPass: true,
      intentScore: `${intents.filter(i => i.pass).length}/${intents.length}`,
      estimatedCost: 1.0,
    },
  };
}

// ── buildFileToIntents ────────────────────────────────────────────────────────

describe('buildFileToIntents()', () => {
  it('intent rule with contextPaths → inverted index', () => {
    const rules: ValidationRule[] = [
      {
        type: 'intent',
        statement: 'store rejects whitespace',
        confidence: 0.9,
        evaluator: 'self',
        context: ['src/stores/todoStore.ts'],
      },
    ];
    const result = buildFileToIntents(rules);
    expect(result).toEqual({
      'src/stores/todoStore.ts': ['store rejects whitespace'],
    });
  });

  it('multiple rules with overlapping paths → all statements included', () => {
    const rules: ValidationRule[] = [
      {
        type: 'intent',
        statement: 'stmt-a',
        confidence: 0.9,
        evaluator: 'self',
        context: ['src/a.ts', 'src/shared.ts'],
      },
      {
        type: 'intent',
        statement: 'stmt-b',
        confidence: 0.9,
        evaluator: 'self',
        context: ['src/b.ts', 'src/shared.ts'],
      },
    ];
    const result = buildFileToIntents(rules);
    expect(result['src/shared.ts']).toEqual(['stmt-a', 'stmt-b']);
    expect(result['src/a.ts']).toEqual(['stmt-a']);
    expect(result['src/b.ts']).toEqual(['stmt-b']);
  });

  it('rule without contextPaths → excluded (conservative)', () => {
    const rules: ValidationRule[] = [
      { type: 'intent', statement: 'no-context-stmt', confidence: 0.9, evaluator: 'self' },
      { type: 'artifact-exists', target: 'src/index.ts' },
    ];
    const result = buildFileToIntents(rules);
    expect(result).toEqual({});
  });
});

// ── blendCandidates ──────────────────────────────────────────────────────────

describe('blendCandidates()', () => {
  it('donor file passes all fileToIntents intents AND is smaller → substituted', () => {
    const primary = makeCandidate('primary', { 'src/util.ts': 'x'.repeat(100) }, [
      { statement: 'util works', pass: true, confidence: 0.9 },
    ]);
    const donor = makeCandidate('donor', { 'src/util.ts': 'x'.repeat(50) }, [
      { statement: 'util works', pass: true, confidence: 0.95 },
    ]);
    const fileToIntents = { 'src/util.ts': ['util works'] };
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);

    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0].path).toBe('src/util.ts');
    expect(result.substitutions[0].from).toBe('donor');
    expect(result.files['src/util.ts']).toBe('x'.repeat(50));
  });

  it('donor file fails an intent → not substituted', () => {
    const primary = makeCandidate('primary', { 'src/util.ts': 'x'.repeat(100) }, [
      { statement: 'util works', pass: true, confidence: 0.9 },
    ]);
    const donor = makeCandidate('donor', { 'src/util.ts': 'x'.repeat(50) }, [
      { statement: 'util works', pass: false, confidence: 0.4 },
    ]);
    const fileToIntents = { 'src/util.ts': ['util works'] };
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);

    expect(result.substitutions).toHaveLength(0);
    expect(result.files['src/util.ts']).toBe('x'.repeat(100));
  });

  it('file not in fileToIntents (empty entry) → not substitutable', () => {
    const primary = makeCandidate('primary', { 'src/util.ts': 'x'.repeat(100) }, []);
    const donor = makeCandidate('donor', { 'src/util.ts': 'x'.repeat(50) }, []);
    const fileToIntents = {}; // no intent coverage for this file
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);

    expect(result.substitutions).toHaveLength(0);
    expect(result.files['src/util.ts']).toBe('x'.repeat(100));
  });

  it('substitution breaks deterministic gate → reverted', () => {
    const primary = makeCandidate('primary', { 'src/util.ts': 'good' }, [
      { statement: 'util works', pass: true, confidence: 0.9 },
    ]);
    const donor = makeCandidate('donor', { 'src/util.ts': 'bad' }, [
      { statement: 'util works', pass: true, confidence: 0.95 },
    ]);
    const fileToIntents = { 'src/util.ts': ['util works'] };
    const result = blendCandidates(
      [primary, donor],
      { primary: 'primary', donors: ['donor'] },
      fileToIntents,
      { deterministicCheck: (files) => !files['src/util.ts'].includes('bad') },
    );

    expect(result.reverted).toHaveLength(1);
    expect(result.reverted[0].path).toBe('src/util.ts');
    expect(result.files['src/util.ts']).toBe('good'); // reverted to primary
  });

  it('all-donors-fail → returns primary candidate files unchanged', () => {
    const primary = makeCandidate('primary', { 'src/a.ts': 'primary-a' }, [
      { statement: 'a works', pass: true, confidence: 0.9 },
    ]);
    const donor = makeCandidate('donor', { 'src/a.ts': 'smaller' }, [
      { statement: 'a works', pass: false, confidence: 0.3 },
    ]);
    const fileToIntents = { 'src/a.ts': ['a works'] };
    const result = blendCandidates([primary, donor], { primary: 'primary', donors: ['donor'] }, fileToIntents);

    expect(result.substitutions).toHaveLength(0);
    expect(result.files).toEqual(primary.files);
  });
});

// ── ConvergenceConfig / runGallery ────────────────────────────────────────────

describe('ConvergenceConfig / runGallery()', () => {
  const stubSpec: EmitGalleryNodeSpec = {
    id: 'test-gallery',
    nodeType: 'emit-gallery',
    candidates: 4,
    strategies: ['faithful', 'minimal', 'robust', 'budget'],
    selectionMode: 'auto',
    validate: [],
    produces: [],
  };

  it('runGallery with 4 strategies → GalleryRunResult with 4 candidates', async () => {
    const result = await runGallery({
      nodeSpec: stubSpec,
      strategies: STRATEGIES,
      workDir: '/tmp',
    });
    if (!result.ok) throw new Error(`Expected ok=true, got ${result.code}`);
    expect(result.data.candidates).toHaveLength(4);
    expect(result.data.scorecard).toContain('faithful');
  });

  it('all candidates fail same intent → GalleryFailure in result.failures', async () => {
    const stmt = 'dark: variants use .dark class selector';
    const makeFailingCandidate = (id: string): CandidateResult => ({
      id,
      strategy: id,
      files: {},
      deterministic: { tsc: { pass: true }, vitest: { pass: true, passed: 5, failed: 0, coverage: 80 }, build: { pass: true } },
      intent: [{ statement: stmt, pass: false, confidence: 0.72, reasoning: 'all candidates used @media prefers-color-scheme', evidence: [] }],
      summary: { loc: 0, fileCount: 0, deterministicPass: true, intentScore: '0/1', estimatedCost: 1.0 },
    });

    const specWithIntent: EmitGalleryNodeSpec = {
      ...stubSpec,
      validate: [{ type: 'intent', statement: stmt, confidence: 0.9, evaluator: 'self' }],
    };

    const result = await runGallery({
      nodeSpec: specWithIntent,
      strategies: STRATEGIES,
      workDir: '/tmp',
      _candidates: ['A', 'B', 'C', 'D'].map(makeFailingCandidate),
    });

    if (!result.ok) throw new Error(`Expected ok=true, got ${result.code}`);
    expect(result.data.failures).toHaveLength(1);
    expect(result.data.failures[0].code).toBe('guardRejection');
    expect(result.data.failures[0].evidence.guardName).toBe(stmt);
  });

  it('GalleryFailure includes bestConfidence, threshold, diagnosis', async () => {
    const stmt = 'todos persist across app restart';
    const makeCandidateWith = (id: string, confidence: number): CandidateResult => ({
      id,
      strategy: id,
      files: {},
      deterministic: { tsc: { pass: true }, vitest: { pass: true, passed: 5, failed: 0, coverage: 80 }, build: { pass: true } },
      intent: [{ statement: stmt, pass: false, confidence, reasoning: 'no persistence found', evidence: [] }],
      summary: { loc: 0, fileCount: 0, deterministicPass: true, intentScore: '0/1', estimatedCost: 1.0 },
    });

    const specWithIntent: EmitGalleryNodeSpec = {
      ...stubSpec,
      validate: [{ type: 'intent', statement: stmt, confidence: 0.85, evaluator: 'self' }],
    };

    const result = await runGallery({
      nodeSpec: specWithIntent,
      strategies: STRATEGIES,
      workDir: '/tmp',
      _candidates: [
        makeCandidateWith('A', 0.5),
        makeCandidateWith('B', 0.72),
        makeCandidateWith('C', 0.4),
        makeCandidateWith('D', 0.3),
      ],
    });

    if (!result.ok) throw new Error(`Expected ok=true, got ${result.code}`);
    expect(result.data.failures).toHaveLength(1);
    const f = result.data.failures[0];
    expect(f.code).toBe('guardRejection');
    // checkFailed field encodes best confidence (0.72) and threshold (0.85)
    expect(f.evidence.checkFailed).toContain('0.72');
    expect(f.evidence.checkFailed).toContain('0.85');
    // candidatesEvaluated field encodes candidate count (4)
    expect(f.evidence.candidatesEvaluated).toBe(4);
  });
});

// ── StrategySpec ──────────────────────────────────────────────────────────────

describe('StrategySpec', () => {
  it('getStrategy("faithful") returns StrategySpec with model containing "opus"', () => {
    const s = getStrategy('faithful');
    expect(s.model).toContain('opus');
  });

  it('getStrategy("budget") returns StrategySpec with lower estimatedCostMultiplier', () => {
    const faithful = getStrategy('faithful');
    const budget = getStrategy('budget');
    expect(budget.estimatedCostMultiplier).toBeLessThan(faithful.estimatedCostMultiplier);
  });

  it('getStrategy("unknown") throws', () => {
    expect(() => getStrategy('unknown')).toThrow();
  });

  it('STRATEGIES has exactly 4 entries', () => {
    expect(STRATEGIES).toHaveLength(4);
  });
});
