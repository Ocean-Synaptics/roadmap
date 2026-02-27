import { describe, it, expect } from 'vitest';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, IntentJudgment } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGraph(validate: ValidationRule[]) {
  return define(graph({
    id: 'expansion-test',
    desc: 'test intent expansion via validateNode',
    init: 'init',
    term: 'app',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
      app: {
        id: 'app',
        desc: 'app with intent validation',
        produces: ['dist/app.js'],
        consumes: ['init.txt'],
        deps: ['init'],
        validate,
        idempotent: true,
      },
    },
  }));
}

function intentRule(overrides: Partial<{
  statement: string; confidence: number; expandOnFail: boolean;
  maxExpansionDepth: number; context: string[];
}> = {}): ValidationRule {
  return {
    type: 'intent',
    statement: overrides.statement ?? 'app works correctly',
    confidence: overrides.confidence ?? 0.9,
    evaluator: 'self',
    context: overrides.context,
    expandOnFail: overrides.expandOnFail ?? true,
    maxExpansionDepth: overrides.maxExpansionDepth,
  };
}

function judgment(statement: string, confidence: number): IntentJudgment {
  return { statement, confidence, reasoning: 'test reasoning', evidence: ['file.ts:10'] };
}

// ── validateNode returns expansionStatus ─────────────────────────────────────

describe('validateNode: intent expandOnFail integration', () => {
  it('returns expansionStatus: expanding when expandOnFail intent fails', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9 });
    const g = makeGraph([rule]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [judgment('app works correctly', 0.72)],
    });

    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');
    expect(result.failingIntents).toHaveLength(1);
    expect(result.failingIntents![0].statement).toBe('app works correctly');
    expect(result.failingIntents![0].achieved).toBe(0.72);
    expect(result.failingIntents![0].threshold).toBe(0.9);
    expect(result.failingIntents![0].reasoning).toBe('test reasoning');
    expect(result.failingIntents![0].evidence).toEqual(['file.ts:10']);
  });

  it('does NOT return expansionStatus when expandOnFail is false', async () => {
    const rule = intentRule({ expandOnFail: false, confidence: 0.9 });
    const g = makeGraph([rule]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [judgment('app works correctly', 0.72)],
    });

    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBeUndefined();
    expect(result.failingIntents).toBeUndefined();
  });

  it('does NOT return expansionStatus when intent passes', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9 });
    const g = makeGraph([rule]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [judgment('app works correctly', 0.95)],
    });

    expect(result.passed).toBe(true);
    expect(result.expansionStatus).toBeUndefined();
    expect(result.failingIntents).toBeUndefined();
  });

  it('collects multiple failing intents with expandOnFail', async () => {
    const ruleA = intentRule({ statement: 'renders correctly', expandOnFail: true });
    const ruleB = intentRule({ statement: 'dark mode works', expandOnFail: true });
    const g = makeGraph([ruleA, ruleB]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [
        judgment('renders correctly', 0.65),
        judgment('dark mode works', 0.70),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');
    expect(result.failingIntents).toHaveLength(2);
    expect(result.failingIntents![0].statement).toBe('renders correctly');
    expect(result.failingIntents![1].statement).toBe('dark mode works');
  });

  it('only includes expandOnFail intents in failingIntents, not bare failures', async () => {
    const ruleExpand = intentRule({ statement: 'expand this', expandOnFail: true });
    const ruleBare = intentRule({ statement: 'bare fail', expandOnFail: false });
    const g = makeGraph([ruleExpand, ruleBare]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [
        judgment('expand this', 0.5),
        judgment('bare fail', 0.5),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');
    expect(result.failingIntents).toHaveLength(1);
    expect(result.failingIntents![0].statement).toBe('expand this');
  });

  it('does NOT set expansionStatus for unevaluated intents', async () => {
    const rule = intentRule({ expandOnFail: true });
    const g = makeGraph([rule]);

    // No judgments provided — unevaluated
    const result = await validateNode(g, 'app', () => true);

    expect(result.passed).toBe(true);
    expect(result.expansionStatus).toBeUndefined();
  });

  it('preserves context paths on failing intents', async () => {
    const rule = intentRule({
      expandOnFail: true,
      context: ['src/theme.css', 'src/toggle.tsx'],
    });
    const g = makeGraph([rule]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [judgment('app works correctly', 0.6)],
    });

    expect(result.failingIntents![0].context).toEqual(['src/theme.css', 'src/toggle.tsx']);
  });

  it('failedReason mentions expansion when expansionStatus is set', async () => {
    const rule = intentRule({ expandOnFail: true });
    const g = makeGraph([rule]);

    const result = await validateNode(g, 'app', () => true, {
      intentJudgments: [judgment('app works correctly', 0.5)],
    });

    expect(result.failedReason).toContain('expansion required');
  });
});

// ── _intentDiagnosis on NodeSpec ─────────────────────────────────────────────

describe('NodeSpec _intentDiagnosis field', () => {
  it('accepts _intentDiagnosis on a node', () => {
    // Type-level test: this compiles if the field exists
    const g = define(graph({
      id: 'diag-test',
      desc: 'test',
      init: 'init',
      term: 'fix',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        fix: {
          id: 'fix',
          desc: 'fix node',
          produces: ['out.ts'],
          consumes: [],
          deps: ['init'],
          validate: [],
          idempotent: true,
          expandedFrom: 'parent',
          _intentDiagnosis: {
            statement: 'app works',
            achievedConfidence: 0.72,
            threshold: 0.9,
            reasoning: 'not enough contrast',
            evidence: ['theme.css:10'],
            expansionDepth: 1,
          },
        },
      },
    }));

    const fixNode = (g.nodes as any).fix;
    expect(fixNode._intentDiagnosis).toBeDefined();
    expect(fixNode._intentDiagnosis.expansionDepth).toBe(1);
    expect(fixNode._intentDiagnosis.statement).toBe('app works');
  });
});
