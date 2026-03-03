// @module llm-feedback-tests
// @purpose Unit tests for LLM feedback loop: metrics+audit→agent improvement prompts

import { describe, it, expect } from 'vitest';
import type { AuditEntry } from '../src/lib/audit/trail.ts';
import type { Brief } from '../src/lib/brief.ts';
import {
  type FeedbackContext,
  type FeedbackPrompt,
  generateFeedback,
  enrichAgentBrief,
  formatFeedbackMarkdown,
} from '../src/llm-feedback.ts';

// -- Fixtures --

function makeContext(overrides: Partial<FeedbackContext> = {}): FeedbackContext {
  return {
    metrics: {
      successRate: 1.0,
      completionVelocity: 5.0,
      validatorHitRate: {},
      batchDurations: [],
      ...overrides.metrics,
    },
    audit: {
      recentDecisions: [],
      rollbacks: [],
      failures: [],
      ...overrides.audit,
    },
    conformance: overrides.conformance,
  };
}

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    nodeId: 'test-node',
    status: 'complete',
    duration: 100,
    ...overrides,
  };
}

function makeBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    position: 'current-node',
    mode: 'execute',
    produces: ['src/output.ts'],
    consumes: ['src/input.ts'],
    description: 'Build output from input',
    pattern: 'Transform pattern',
    handoffJournal: [],
    remaining: 3,
    ...overrides,
  };
}

// -- Tests --

describe('generateFeedback', () => {
  it('reports healthy system with high success rate and no issues', () => {
    const ctx = makeContext({ metrics: { successRate: 0.98, completionVelocity: 5, validatorHitRate: {}, batchDurations: [] } });
    const fb = generateFeedback(ctx);

    expect(fb.priority).toBe('low');
    expect(fb.strengths.length).toBeGreaterThan(0);
    expect(fb.improvements.length).toBe(0);
    expect(fb.summary).toContain('healthy');
  });

  it('flags low success rate as high priority', () => {
    const ctx = makeContext({ metrics: { successRate: 0.5, completionVelocity: 2, validatorHitRate: {}, batchDurations: [] } });
    const fb = generateFeedback(ctx);

    expect(fb.priority).toBe('high');
    expect(fb.improvements.some(i => i.includes('success rate'))).toBe(true);
    expect(fb.suggestions.length).toBeGreaterThan(0);
  });

  it('flags acceptable success rate as strength', () => {
    const ctx = makeContext({ metrics: { successRate: 0.85, completionVelocity: 3, validatorHitRate: {}, batchDurations: [] } });
    const fb = generateFeedback(ctx);

    expect(fb.strengths.some(s => s.includes('Acceptable'))).toBe(true);
  });

  it('detects rollback instability', () => {
    const rollbacks = [
      makeAuditEntry({ nodeId: 'n1', status: 'skipped' }),
      makeAuditEntry({ nodeId: 'n2', status: 'skipped' }),
      makeAuditEntry({ nodeId: 'n3', status: 'skipped' }),
    ];
    const ctx = makeContext({ audit: { recentDecisions: [], rollbacks, failures: [] } });
    const fb = generateFeedback(ctx);

    expect(fb.improvements.some(i => i.includes('rollback'))).toBe(true);
    expect(fb.priority).toBe('high');
  });

  it('flags persistent failure on same node as critical', () => {
    const failures = [
      makeAuditEntry({ nodeId: 'flaky-node', status: 'failed' }),
      makeAuditEntry({ nodeId: 'flaky-node', status: 'failed' }),
      makeAuditEntry({ nodeId: 'flaky-node', status: 'failed' }),
    ];
    const ctx = makeContext({ audit: { recentDecisions: [], rollbacks: [], failures } });
    const fb = generateFeedback(ctx);

    expect(fb.priority).toBe('critical');
    expect(fb.improvements.some(i => i.includes('flaky-node'))).toBe(true);
    expect(fb.suggestions.some(s => s.includes('flaky-node'))).toBe(true);
  });

  it('detects declining velocity from batch durations', () => {
    // Older batches: fast (1000ms), recent batches: slow (3000ms = 3x slower)
    const batchDurations = [1000, 1000, 1000, 3000, 3000, 3000];
    const ctx = makeContext({ metrics: { successRate: 1, completionVelocity: 2, validatorHitRate: {}, batchDurations } });
    const fb = generateFeedback(ctx);

    expect(fb.improvements.some(i => i.includes('velocity'))).toBe(true);
  });

  it('detects improving velocity', () => {
    // Older batches: slow, recent: fast
    const batchDurations = [3000, 3000, 3000, 800, 800, 800];
    const ctx = makeContext({ metrics: { successRate: 1, completionVelocity: 5, validatorHitRate: {}, batchDurations } });
    const fb = generateFeedback(ctx);

    expect(fb.strengths.some(s => s.includes('velocity') && s.includes('improving'))).toBe(true);
  });

  it('handles conformance — full coverage', () => {
    const ctx = makeContext({
      conformance: { unmappedScenarios: [], partialCoverage: [], conformant: true },
    });
    const fb = generateFeedback(ctx);

    expect(fb.strengths.some(s => s.includes('spec conformance'))).toBe(true);
  });

  it('flags unmapped spec scenarios', () => {
    const ctx = makeContext({
      conformance: {
        unmappedScenarios: ['login-redirect', 'session-timeout'],
        partialCoverage: [],
        conformant: false,
      },
    });
    const fb = generateFeedback(ctx);

    expect(fb.improvements.some(i => i.includes('unmapped'))).toBe(true);
    expect(fb.suggestions.some(s => s.includes('login-redirect'))).toBe(true);
    expect(fb.priority).toBe('high');
  });

  it('flags partial coverage scenarios', () => {
    const ctx = makeContext({
      conformance: {
        unmappedScenarios: [],
        partialCoverage: ['auth-flow'],
        conformant: false,
      },
    });
    const fb = generateFeedback(ctx);

    expect(fb.improvements.some(i => i.includes('partial coverage'))).toBe(true);
  });

  it('produces summary with issue count', () => {
    const ctx = makeContext({
      metrics: { successRate: 0.5, completionVelocity: 1, validatorHitRate: {}, batchDurations: [] },
      audit: { recentDecisions: [], rollbacks: [makeAuditEntry({ status: 'skipped' }), makeAuditEntry({ status: 'skipped' }), makeAuditEntry({ status: 'skipped' })], failures: [] },
    });
    const fb = generateFeedback(ctx);

    expect(fb.summary).toMatch(/\d+ issue/);
  });
});

describe('enrichAgentBrief', () => {
  it('generates enrichment with feedback section', () => {
    const brief = makeBrief();
    const ctx = makeContext();
    const enrichment = enrichAgentBrief(brief, ctx);

    expect(enrichment.feedbackSection).toContain('## Feedback');
    expect(enrichment.contextualHints.length).toBeGreaterThan(0);
    expect(Array.isArray(enrichment.avoidPatterns)).toBe(true);
  });

  it('warns about upstream failures affecting consumed artifacts', () => {
    const brief = makeBrief({ consumes: ['src/input.ts'] });
    const ctx = makeContext({
      audit: {
        recentDecisions: [],
        rollbacks: [],
        failures: [
          makeAuditEntry({
            nodeId: 'upstream-node',
            status: 'failed',
            artifacts: [{ path: 'src/input.ts', hash: 'abc123' }],
          }),
        ],
      },
    });
    const enrichment = enrichAgentBrief(brief, ctx);

    expect(enrichment.contextualHints.some(h => h.includes('upstream-node'))).toBe(true);
  });

  it('adds avoid patterns from failed validators', () => {
    const ctx = makeContext({
      audit: {
        recentDecisions: [],
        rollbacks: [],
        failures: [
          makeAuditEntry({
            status: 'failed',
            validation: { type: 'artifact-exists', passed: false },
          }),
        ],
      },
    });
    const enrichment = enrichAgentBrief(makeBrief(), ctx);

    expect(enrichment.avoidPatterns.some(p => p.includes('artifact-exists'))).toBe(true);
  });

  it('adds rollback nodes as avoid patterns', () => {
    const ctx = makeContext({
      audit: {
        recentDecisions: [],
        rollbacks: [makeAuditEntry({ nodeId: 'bad-node', status: 'skipped' })],
        failures: [],
      },
    });
    const enrichment = enrichAgentBrief(makeBrief(), ctx);

    expect(enrichment.avoidPatterns.some(p => p.includes('bad-node'))).toBe(true);
  });

  it('hints about low velocity', () => {
    const ctx = makeContext({ metrics: { successRate: 1, completionVelocity: 0.5, validatorHitRate: {}, batchDurations: [] } });
    const enrichment = enrichAgentBrief(makeBrief(), ctx);

    expect(enrichment.contextualHints.some(h => h.includes('Low velocity'))).toBe(true);
  });
});

describe('formatFeedbackMarkdown', () => {
  it('formats feedback as markdown with all sections', () => {
    const fb: FeedbackPrompt = {
      summary: 'Test summary',
      strengths: ['Strength 1'],
      improvements: ['Improvement 1'],
      suggestions: ['Suggestion 1'],
      priority: 'high',
    };
    const md = formatFeedbackMarkdown(fb);

    expect(md).toContain('## Feedback [HIGH]');
    expect(md).toContain('Test summary');
    expect(md).toContain('### Strengths');
    expect(md).toContain('- Strength 1');
    expect(md).toContain('### Improvements');
    expect(md).toContain('- Improvement 1');
    expect(md).toContain('### Suggestions');
    expect(md).toContain('- Suggestion 1');
  });

  it('omits empty sections', () => {
    const fb: FeedbackPrompt = {
      summary: 'All good',
      strengths: ['Good'],
      improvements: [],
      suggestions: [],
      priority: 'low',
    };
    const md = formatFeedbackMarkdown(fb);

    expect(md).toContain('### Strengths');
    expect(md).not.toContain('### Improvements');
    expect(md).not.toContain('### Suggestions');
  });

  it('includes priority level in header', () => {
    const fb: FeedbackPrompt = {
      summary: 'Issues found',
      strengths: [],
      improvements: ['Problem'],
      suggestions: [],
      priority: 'critical',
    };
    const md = formatFeedbackMarkdown(fb);

    expect(md).toContain('[CRITICAL]');
  });
});
