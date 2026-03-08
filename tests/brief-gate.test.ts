// Unit tests for brief-gate.ts — pure validation, zero IO.
import { describe, it, expect } from 'vitest';
import {
  BriefGate,
  validateBrief,
  validateBriefContract,
  isSealedBrief,
  formatBriefValidationReport,
  type BriefValidationResult,
} from '../src/lib/agent-dispatch/brief-gate.ts';
import type { Brief, FinalHandoff, InterimHandoff } from '../src/lib/brief.ts';

// --- Factories ---

function validHandoff(): FinalHandoff {
  return {
    timestamp: '2026-03-08T00:00:00Z',
    progress: 0.8,
    discovered: ['found edge case'],
    blockers: [],
    currentFile: 'src/auth.ts',
    summary: 'Built auth module',
    keyDecisions: ['JWT over session'],
    gotchas: ['token refresh race'],
    nextNodeEntry: {
      consumes: ['src/auth.ts'],
      ready: true,
    },
  };
}

function validBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    dagIntent: 'test dag',
    position: 'impl-auth',
    mode: 'execute',
    produces: ['src/auth.ts'],
    consumes: ['src/index.ts'],
    description: 'Implement auth module',
    pattern: 'Build the artifacts listed in produces.',
    handoffJournal: [],
    remaining: 3,
    ...overrides,
  } as Brief;
}

function validInterim(): InterimHandoff {
  return {
    timestamp: '2026-03-08T01:00:00Z',
    progress: 0.4,
    discovered: [],
    blockers: [],
    currentFile: 'src/auth.ts',
  };
}

// === BriefGate.validate ===

describe('BriefGate.validate', () => {
  const gate = new BriefGate();

  // --- Valid brief ---

  it('passes a valid brief with all required fields', () => {
    const result = gate.validate(validBrief());
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.timestamp).toBeTruthy();
  });

  it('passes a valid brief with mode=plan', () => {
    const result = gate.validate(validBrief({ mode: 'plan' }));
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --- Required fields ---

  it('rejects missing position', () => {
    const brief = validBrief();
    delete (brief as any).position;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'position')).toBe(true);
  });

  it('rejects missing mode', () => {
    const brief = validBrief();
    delete (brief as any).mode;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'mode')).toBe(true);
  });

  it('rejects missing produces', () => {
    const brief = validBrief();
    delete (brief as any).produces;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'produces')).toBe(true);
  });

  it('rejects missing consumes', () => {
    const brief = validBrief();
    delete (brief as any).consumes;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'consumes')).toBe(true);
  });

  it('rejects missing description', () => {
    const brief = validBrief();
    delete (brief as any).description;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'description')).toBe(true);
  });

  it('rejects missing pattern', () => {
    const brief = validBrief();
    delete (brief as any).pattern;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'pattern')).toBe(true);
  });

  it('rejects missing handoffJournal', () => {
    const brief = validBrief();
    delete (brief as any).handoffJournal;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'handoffJournal')).toBe(true);
  });

  it('rejects missing remaining', () => {
    const brief = validBrief();
    delete (brief as any).remaining;
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD' && e.field === 'remaining')).toBe(true);
  });

  // --- Field format validation ---

  it('rejects empty position string', () => {
    const result = gate.validate(validBrief({ position: '' }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_POSITION')).toBe(true);
  });

  it('rejects whitespace-only position', () => {
    const result = gate.validate(validBrief({ position: '   ' }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_POSITION')).toBe(true);
  });

  it('rejects invalid mode', () => {
    const result = gate.validate(validBrief({ mode: 'invalid' as any }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_MODE')).toBe(true);
  });

  it('rejects non-array produces', () => {
    const result = gate.validate(validBrief({ produces: 'src/auth.ts' as any }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_TYPE' && e.field === 'produces')).toBe(true);
  });

  it('rejects non-array consumes', () => {
    const result = gate.validate(validBrief({ consumes: 'src/index.ts' as any }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_TYPE' && e.field === 'consumes')).toBe(true);
  });

  it('warns on oversized produces (>5 items)', () => {
    const result = gate.validate(validBrief({
      produces: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
    }));
    expect(result.passed).toBe(true); // warning, not error
    expect(result.warnings.some(w => w.code === 'EXCEEDS_RECOMMENDED_SIZE' && w.field === 'produces')).toBe(true);
  });

  it('warns on oversized consumes (>5 items)', () => {
    const result = gate.validate(validBrief({
      consumes: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'],
    }));
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => w.code === 'EXCEEDS_RECOMMENDED_SIZE' && w.field === 'consumes')).toBe(true);
  });

  it('does not warn when produces has exactly 5 items', () => {
    const result = gate.validate(validBrief({
      produces: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
    }));
    expect(result.warnings.filter(w => w.field === 'produces')).toHaveLength(0);
  });

  it('rejects empty description', () => {
    const result = gate.validate(validBrief({ description: '' }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_DESCRIPTION')).toBe(true);
  });

  it('warns on description exceeding 150 chars', () => {
    const result = gate.validate(validBrief({ description: 'x'.repeat(151) }));
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => w.code === 'EXCEEDS_SIZE_LIMIT' && w.field === 'description')).toBe(true);
  });

  it('does not warn on description of exactly 150 chars', () => {
    const result = gate.validate(validBrief({ description: 'x'.repeat(150) }));
    expect(result.warnings.filter(w => w.field === 'description')).toHaveLength(0);
  });

  it('rejects empty pattern', () => {
    const result = gate.validate(validBrief({ pattern: '' }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_PATTERN')).toBe(true);
  });

  it('warns on pattern exceeding 150 chars', () => {
    const result = gate.validate(validBrief({ pattern: 'y'.repeat(151) }));
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => w.code === 'EXCEEDS_SIZE_LIMIT' && w.field === 'pattern')).toBe(true);
  });

  it('rejects negative remaining', () => {
    const result = gate.validate(validBrief({ remaining: -1 }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_REMAINING')).toBe(true);
  });

  it('rejects non-integer remaining', () => {
    const result = gate.validate(validBrief({ remaining: 2.5 }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_REMAINING')).toBe(true);
  });

  it('accepts remaining of 0', () => {
    const result = gate.validate(validBrief({ remaining: 0 }));
    expect(result.errors.filter(e => e.field === 'remaining')).toHaveLength(0);
  });

  it('rejects non-array handoffJournal', () => {
    // Use a non-iterable non-array (number) to avoid the source's `in` operator
    // crashing on string characters — string passes .length > 0 and enters
    // checkHandoffJournal where `'summary' in char` throws TypeError.
    const result = gate.validate(validBrief({ handoffJournal: 123 as any }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_TYPE' && e.field === 'handoffJournal')).toBe(true);
  });

  // --- Artifact integrity ---

  it('rejects node-ID-like strings in produces', () => {
    const result = gate.validate(validBrief({ produces: ['setup-db'] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE' && e.field === 'produces')).toBe(true);
  });

  it('rejects node-ID-like strings in consumes', () => {
    const result = gate.validate(validBrief({ consumes: ['auth-impl'] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE' && e.field === 'consumes')).toBe(true);
  });

  it('accepts absolute path artifacts', () => {
    const result = gate.validate(validBrief({ produces: ['/home/user/project/src/auth.ts'] }));
    expect(result.errors.filter(e => e.field === 'produces')).toHaveLength(0);
  });

  it('accepts relative path artifacts', () => {
    const result = gate.validate(validBrief({ produces: ['./src/auth.ts'] }));
    expect(result.errors.filter(e => e.field === 'produces')).toHaveLength(0);
  });

  it('accepts lowercase-start paths with extension', () => {
    const result = gate.validate(validBrief({ produces: ['src/auth.ts'] }));
    expect(result.errors.filter(e => e.field === 'produces')).toHaveLength(0);
  });

  it('rejects empty string in produces', () => {
    const result = gate.validate(validBrief({ produces: [''] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE')).toBe(true);
  });

  it('accepts empty produces array', () => {
    const result = gate.validate(validBrief({ produces: [] }));
    expect(result.errors.filter(e => e.field === 'produces')).toHaveLength(0);
  });

  // --- DAG leakage ---

  it('rejects brief containing nodes field', () => {
    const brief = validBrief();
    (brief as any).nodes = { a: {}, b: {} };
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_NODES')).toBe(true);
  });

  it('rejects brief containing deps field', () => {
    const brief = validBrief();
    (brief as any).deps = ['init', 'setup'];
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_DEPS')).toBe(true);
  });

  it('rejects brief containing graph field', () => {
    const brief = validBrief();
    (brief as any).graph = { id: 'leaked' };
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_GRAPH')).toBe(true);
  });

  it('does not flag DAG leakage on clean brief', () => {
    const result = gate.validate(validBrief());
    const leakErrors = result.errors.filter(e => e.code.startsWith('DAG_LEAKAGE'));
    expect(leakErrors).toHaveLength(0);
  });

  // --- Handoff integrity ---

  it('passes valid handoff', () => {
    const result = gate.validate(validBrief({ handoff: validHandoff() }));
    expect(result.passed).toBe(true);
  });

  it('rejects handoff with missing required fields', () => {
    const handoff = { progress: 0.5 } as any;
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_HANDOFF_FIELD')).toBe(true);
  });

  it('rejects handoff summary exceeding 100 chars', () => {
    const handoff = validHandoff();
    handoff.summary = 'z'.repeat(101);
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'SUMMARY_TOO_LONG')).toBe(true);
  });

  it('accepts handoff summary at exactly 100 chars', () => {
    const handoff = validHandoff();
    handoff.summary = 'z'.repeat(100);
    const result = gate.validate(validBrief({ handoff }));
    const summaryErrors = result.errors.filter(e => e.code === 'SUMMARY_TOO_LONG');
    expect(summaryErrors).toHaveLength(0);
  });

  it('rejects handoff progress below 0', () => {
    const handoff = validHandoff();
    handoff.progress = -0.1;
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_PROGRESS' && e.field === 'handoff.progress')).toBe(true);
  });

  it('rejects handoff progress above 1', () => {
    const handoff = validHandoff();
    handoff.progress = 1.1;
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_PROGRESS' && e.field === 'handoff.progress')).toBe(true);
  });

  it('accepts handoff progress at boundary values 0 and 1', () => {
    for (const p of [0, 1]) {
      const handoff = validHandoff();
      handoff.progress = p;
      const result = gate.validate(validBrief({ handoff }));
      const progressErrors = result.errors.filter(e => e.code === 'INVALID_PROGRESS');
      expect(progressErrors).toHaveLength(0);
    }
  });

  it('rejects handoff with non-array nextNodeEntry.consumes', () => {
    const handoff = validHandoff();
    (handoff.nextNodeEntry as any).consumes = 'bad';
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.field === 'handoff.nextNodeEntry.consumes')).toBe(true);
  });

  it('rejects handoff with non-boolean nextNodeEntry.ready', () => {
    const handoff = validHandoff();
    (handoff.nextNodeEntry as any).ready = 'yes';
    const result = gate.validate(validBrief({ handoff }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.field === 'handoff.nextNodeEntry.ready')).toBe(true);
  });

  // --- Handoff journal ---

  it('validates journal entry timestamps', () => {
    const result = gate.validate(validBrief({
      handoffJournal: [{ ...validInterim(), timestamp: '' }],
    }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_TIMESTAMP')).toBe(true);
  });

  it('validates journal entry progress bounds', () => {
    const result = gate.validate(validBrief({
      handoffJournal: [{ ...validInterim(), progress: 1.5 }],
    }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e =>
      e.code === 'INVALID_PROGRESS' && e.field.startsWith('handoffJournal'),
    )).toBe(true);
  });

  it('validates final journal entries require summary', () => {
    const finalEntry = { ...validInterim(), summary: '' } as any;
    const result = gate.validate(validBrief({ handoffJournal: [finalEntry] }));
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_SUMMARY')).toBe(true);
  });

  it('passes valid journal with mixed interim and final entries', () => {
    const result = gate.validate(validBrief({
      handoffJournal: [
        validInterim(),
        { ...validInterim(), timestamp: '2026-03-08T02:00:00Z', progress: 0.9, summary: 'Done', keyDecisions: [], gotchas: [], nextNodeEntry: { consumes: [], ready: true } },
      ],
    }));
    expect(result.passed).toBe(true);
  });

  // --- Multiple errors accumulate ---

  it('accumulates multiple errors from different checks', () => {
    const brief = validBrief({
      position: '',
      mode: 'bogus' as any,
      description: '',
      remaining: -5,
    });
    const result = gate.validate(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

// === validateBrief (convenience function) ===

describe('validateBrief', () => {
  it('delegates to BriefGate.validate', () => {
    const result = validateBrief(validBrief());
    expect(result.passed).toBe(true);
    expect(result.timestamp).toBeTruthy();
  });

  it('returns errors for invalid brief', () => {
    const brief = validBrief();
    delete (brief as any).position;
    const result = validateBrief(brief);
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// === validateBriefContract ===

describe('validateBriefContract', () => {
  it('rejects null', () => {
    const result = validateBriefContract(null);
    expect(result.passed).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
    expect(result.errors[0].message).toBe('Brief must be an object');
  });

  it('rejects undefined', () => {
    const result = validateBriefContract(undefined);
    expect(result.passed).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
  });

  it('rejects primitive string', () => {
    const result = validateBriefContract('not an object');
    expect(result.passed).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_TYPE');
  });

  it('rejects number', () => {
    const result = validateBriefContract(42);
    expect(result.passed).toBe(false);
  });

  it('passes valid brief object', () => {
    const result = validateBriefContract(validBrief());
    expect(result.passed).toBe(true);
  });

  it('validates an object missing required fields', () => {
    const result = validateBriefContract({ foo: 'bar' });
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_FIELD')).toBe(true);
  });
});

// === isSealedBrief ===

describe('isSealedBrief', () => {
  it('returns true for valid brief shape', () => {
    expect(isSealedBrief(validBrief())).toBe(true);
  });

  it('returns false for null', () => {
    expect(isSealedBrief(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSealedBrief(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isSealedBrief('string')).toBe(false);
  });

  it('returns false when position is not string', () => {
    expect(isSealedBrief({ ...validBrief(), position: 123 })).toBe(false);
  });

  it('returns false when mode is invalid', () => {
    expect(isSealedBrief({ ...validBrief(), mode: 'run' })).toBe(false);
  });

  it('returns false when produces is not array', () => {
    expect(isSealedBrief({ ...validBrief(), produces: 'file.ts' })).toBe(false);
  });

  it('returns false when consumes is not array', () => {
    expect(isSealedBrief({ ...validBrief(), consumes: {} })).toBe(false);
  });

  it('returns false when description is not string', () => {
    expect(isSealedBrief({ ...validBrief(), description: 42 })).toBe(false);
  });

  it('returns false when pattern is not string', () => {
    expect(isSealedBrief({ ...validBrief(), pattern: null })).toBe(false);
  });

  it('returns false when handoffJournal is not array', () => {
    expect(isSealedBrief({ ...validBrief(), handoffJournal: 'nope' })).toBe(false);
  });

  it('returns false when remaining is not number', () => {
    expect(isSealedBrief({ ...validBrief(), remaining: '3' })).toBe(false);
  });

  it('returns true for plan mode', () => {
    expect(isSealedBrief({ ...validBrief(), mode: 'plan' })).toBe(true);
  });
});

// === formatBriefValidationReport ===

describe('formatBriefValidationReport', () => {
  it('reports pass with checkmark when clean', () => {
    const result: BriefValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      timestamp: '2026-03-08T00:00:00Z',
    };
    const report = formatBriefValidationReport(result);
    expect(report).toContain('Brief validation passed');
    expect(report).toContain('2026-03-08T00:00:00Z');
  });

  it('reports failure with error details', () => {
    const result: BriefValidationResult = {
      passed: false,
      errors: [{
        field: 'position',
        code: 'INVALID_POSITION',
        message: 'position must be non-empty string',
        value: '',
      }],
      warnings: [],
      timestamp: '2026-03-08T00:00:00Z',
    };
    const report = formatBriefValidationReport(result);
    expect(report).toContain('Brief validation failed');
    expect(report).toContain('INVALID_POSITION');
    expect(report).toContain('position');
    expect(report).toContain('Value:');
  });

  it('includes warnings section when warnings exist', () => {
    const result: BriefValidationResult = {
      passed: true,
      errors: [],
      warnings: [{
        field: 'produces',
        code: 'EXCEEDS_RECOMMENDED_SIZE',
        message: 'produces exceeds recommended limit',
        value: 7,
      }],
      timestamp: '2026-03-08T00:00:00Z',
    };
    const report = formatBriefValidationReport(result);
    expect(report).toContain('Warnings:');
    expect(report).toContain('EXCEEDS_RECOMMENDED_SIZE');
  });

  it('includes both errors and warnings when both exist', () => {
    const result: BriefValidationResult = {
      passed: false,
      errors: [{
        field: 'mode',
        code: 'INVALID_MODE',
        message: 'mode must be execute or plan',
      }],
      warnings: [{
        field: 'description',
        code: 'EXCEEDS_SIZE_LIMIT',
        message: 'description too long',
        value: 200,
      }],
      timestamp: '2026-03-08T00:00:00Z',
    };
    const report = formatBriefValidationReport(result);
    expect(report).toContain('Errors:');
    expect(report).toContain('Warnings:');
    expect(report).toContain('INVALID_MODE');
    expect(report).toContain('EXCEEDS_SIZE_LIMIT');
  });

  it('omits Value line when error has no value', () => {
    const result: BriefValidationResult = {
      passed: false,
      errors: [{
        field: 'description',
        code: 'INVALID_DESCRIPTION',
        message: 'description must be non-empty string',
      }],
      warnings: [],
      timestamp: '2026-03-08T00:00:00Z',
    };
    const report = formatBriefValidationReport(result);
    expect(report).not.toContain('Value:');
  });
});
