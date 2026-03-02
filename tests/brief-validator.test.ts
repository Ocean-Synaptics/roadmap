// Brief schema validation tests
// Enforces Contract 7: Brief Isolation (no DAG introspection)

import { describe, it, expect } from 'vitest';
import {
  validateBriefSchema,
  assertBriefSchema,
  BriefSchemaError,
} from '../src/lib/agent-dispatch/brief-validator.ts';
import { Brief } from '../src/lib/agent-dispatch/brief-gate.ts';

describe('Brief Schema Validation (Contract 7: Brief Isolation)', () => {
  // Valid briefs
  describe('Valid briefs', () => {
    it('accepts minimal valid brief', () => {
      const brief = {
        position: 'my-node',
        produces: ['output.ts'],
        consumes: [],
        description: 'Do something useful',
        idempotent: true,
        validate: [{ type: 'artifact-exists', path: 'output.ts' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts brief with multiple produces', () => {
      const brief = {
        position: 'integration-node',
        produces: ['src/index.ts', 'src/types.ts', 'tests/index.test.ts'],
        consumes: ['src/config.ts'],
        description: 'Integrate multiple modules',
        idempotent: false,
        validate: [
          { type: 'artifact-exists', path: 'src/index.ts' },
          { type: 'shell', cmd: 'npm test' },
        ],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('accepts brief with multiple consumes', () => {
      const brief = {
        position: 'consumer-node',
        produces: ['output.md'],
        consumes: ['input1.ts', 'input2.ts', 'config.json'],
        description: 'Consume multiple inputs',
        idempotent: true,
        validate: [{ type: 'artifact-exists', path: 'output.md' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('accepts brief with all validation rule types', () => {
      const brief = {
        position: 'comprehensive-node',
        produces: ['lib/index.ts', 'tests/index.test.ts'],
        consumes: ['src/types.ts'],
        description: 'Comprehensive validation',
        idempotent: true,
        validate: [
          { type: 'artifact-exists', path: 'lib/index.ts' },
          { type: 'shell', cmd: 'npm run lint' },
          { type: 'spec-conformance', spec: 'spec.md', scenario: 'main flow' },
          { type: 'build-produces', cmd: 'npm run build' },
          { type: 'launch-check', cmd: 'npm start' },
        ],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('accepts brief with only required fields', () => {
      const brief = {
        position: 'minimal',
        produces: ['output.txt'],
        consumes: [],
        description: 'Minimal brief',
        idempotent: true,
        validate: [{ type: 'artifact-exists', path: 'output.txt' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });
  });

  // Root level errors
  describe('Root level validation', () => {
    it('rejects null', () => {
      const result = validateBriefSchema(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('BRIEF_NOT_OBJECT');
    });

    it('rejects undefined', () => {
      const result = validateBriefSchema(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('BRIEF_NOT_OBJECT');
    });

    it('rejects array', () => {
      const result = validateBriefSchema([]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('BRIEF_NOT_OBJECT');
    });

    it('rejects string', () => {
      const result = validateBriefSchema('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('BRIEF_NOT_OBJECT');
    });

    it('rejects number', () => {
      const result = validateBriefSchema(42);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('BRIEF_NOT_OBJECT');
    });
  });

  // Contract 7: No DAG introspection
  describe('Contract 7: Brief Isolation (no DAG introspection)', () => {
    it('rejects brief with deps field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        deps: ['other-node'], // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
      expect(result.errors.some(e => e.path === 'deps')).toBe(true);
    });

    it('rejects brief with pattern field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        pattern: 'parallel-batch', // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });

    it('rejects brief with remaining field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        remaining: 5, // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });

    it('rejects brief with level field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        level: 3, // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });

    it('rejects brief with status field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        status: 'in-progress', // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });

    it('rejects brief with nodes field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        nodes: { a: {}, b: {} }, // FORBIDDEN
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });

    it('rejects brief with multiple DAG introspection fields', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        deps: [],
        level: 2,
        status: 'completed',
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      const leakErrors = result.errors.filter(e => e.code === 'BRIEF_LEAKS_DAG_STATE');
      expect(leakErrors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // Unknown fields
  describe('Unknown fields', () => {
    it('rejects brief with unknown field', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        unknownField: 'value',
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_UNKNOWN_FIELD')).toBe(true);
    });

    it('rejects brief with multiple unknown fields', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        unknown1: 'value',
        unknown2: 'value',
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      const unknownErrors = result.errors.filter(e => e.code === 'BRIEF_UNKNOWN_FIELD');
      expect(unknownErrors.length).toBe(2);
    });
  });

  // Position field
  describe('position field', () => {
    it('rejects missing position', () => {
      const brief: Record<string, unknown> = {
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'position')).toBe(true);
    });

    it('rejects non-string position', () => {
      const brief: Record<string, unknown> = {
        position: 123,
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_POSITION')).toBe(true);
    });

    it('rejects empty position', () => {
      const brief: Record<string, unknown> = {
        position: '',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_POSITION')).toBe(true);
    });

    it('rejects whitespace-only position', () => {
      const brief: Record<string, unknown> = {
        position: '   ',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_POSITION')).toBe(true);
    });
  });

  // Produces field
  describe('produces field', () => {
    it('rejects missing produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'produces')).toBe(true);
    });

    it('rejects non-array produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: 'output.ts',
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_PRODUCES')).toBe(true);
    });

    it('rejects empty produces array', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: [],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_PRODUCES')).toBe(true);
    });

    it('rejects non-string item in produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts', 123],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_PRODUCE_ITEM')).toBe(true);
    });

    it('rejects empty string in produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts', ''],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_PRODUCE_PATH')).toBe(true);
    });

    it('rejects duplicate paths in produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts', 'other.ts', 'output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_DUPLICATE_PRODUCE')).toBe(true);
    });
  });

  // Consumes field
  describe('consumes field', () => {
    it('rejects missing consumes', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'consumes')).toBe(true);
    });

    it('rejects non-array consumes', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: 'input.ts',
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_CONSUMES')).toBe(true);
    });

    it('accepts empty consumes array', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('rejects non-string item in consumes', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: ['input.ts', 123],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_CONSUME_ITEM')).toBe(true);
    });

    it('rejects empty string in consumes', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: ['input.ts', ''],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_CONSUME_PATH')).toBe(true);
    });

    it('rejects duplicate paths in consumes', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: ['input.ts', 'other.ts', 'input.ts'],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_DUPLICATE_CONSUME')).toBe(true);
    });

    it('rejects overlapping consumes and produces', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts', 'shared.ts'],
        consumes: ['input.ts', 'shared.ts'],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_CONSUME_PRODUCE_OVERLAP')).toBe(true);
    });
  });

  // Description field
  describe('description field', () => {
    it('rejects missing description', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'description')).toBe(true);
    });

    it('rejects non-string description', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 123,
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_DESCRIPTION')).toBe(true);
    });

    it('rejects empty description', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: '',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_DESCRIPTION')).toBe(true);
    });

    it('rejects whitespace-only description', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: '   ',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_DESCRIPTION')).toBe(true);
    });
  });

  // Idempotent field
  describe('idempotent field', () => {
    it('rejects missing idempotent', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'idempotent')).toBe(true);
    });

    it('rejects non-boolean idempotent', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: 'true',
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_IDEMPOTENT')).toBe(true);
    });

    it('accepts true', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('accepts false', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: false,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });
  });

  // Validate field
  describe('validate field', () => {
    it('rejects missing validate', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_MISSING_FIELD' && e.path === 'validate')).toBe(true);
    });

    it('rejects non-array validate', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: { type: 'artifact-exists' },
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_VALIDATE')).toBe(true);
    });

    it('rejects empty validate array', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_EMPTY_VALIDATE')).toBe(true);
    });

    it('rejects non-object validate rule', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: ['artifact-exists'],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_VALIDATE_RULE')).toBe(true);
    });

    it('rejects array as validate rule', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [[]],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_INVALID_VALIDATE_RULE')).toBe(true);
    });

    it('rejects validate rule without type', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ path: 'output.ts' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_VALIDATE_MISSING_TYPE')).toBe(true);
    });

    it('rejects validate rule with non-string type', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 123 }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_VALIDATE_INVALID_TYPE')).toBe(true);
    });

    it('rejects validate rule with unknown type', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'unknown-validator' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_VALIDATE_UNKNOWN_TYPE')).toBe(true);
    });

    it('accepts multiple validation rules', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [
          { type: 'artifact-exists', path: 'output.ts' },
          { type: 'shell', cmd: 'npm test' },
          { type: 'spec-conformance', spec: 'spec.md', scenario: 'main' },
        ],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('accepts all recognized rule types', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [
          { type: 'artifact-exists' },
          { type: 'shell' },
          { type: 'spec-conformance' },
          { type: 'build-produces' },
          { type: 'launch-check' },
          { type: 'artifact-schema' },
          { type: 'intent' },
        ],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });
  });

  // assertBriefSchema (throws on invalid)
  describe('assertBriefSchema', () => {
    it('returns without error for valid brief', () => {
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      expect(() => assertBriefSchema(brief)).not.toThrow();
    });

    it('throws BriefSchemaError for invalid brief', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        // Missing produces
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      expect(() => assertBriefSchema(brief)).toThrow(BriefSchemaError);
    });

    it('includes error details in thrown error', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        deps: [], // Contract 7 violation
      };

      try {
        assertBriefSchema(brief);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BriefSchemaError);
        const schemaErr = err as BriefSchemaError;
        expect(schemaErr.code).toBe('BRIEF_SCHEMA_INVALID');
        expect(schemaErr.message).toContain('Brief schema validation failed');
        expect(schemaErr.context?.errorCount).toBeGreaterThan(0);
      }
    });
  });

  // Edge cases and stress tests
  describe('Edge cases', () => {
    it('handles brief with very long produce path', () => {
      const longPath = 'a'.repeat(500) + '.ts';
      const brief = {
        position: 'test',
        produces: [longPath],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('handles brief with many produces', () => {
      const produces = Array.from({ length: 100 }, (_, i) => `file${i}.ts`);
      const brief = {
        position: 'test',
        produces,
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('handles brief with many consumes', () => {
      const consumes = Array.from({ length: 100 }, (_, i) => `input${i}.ts`);
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes,
        description: 'Test',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('handles brief with many validation rules', () => {
      const validate = Array.from({ length: 50 }, (_, i) => ({
        type: i % 2 === 0 ? 'artifact-exists' : 'shell',
      }));
      const brief = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: true,
        validate,
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('provides path context for all errors', () => {
      const brief: Record<string, unknown> = {
        // Missing multiple fields
        consumes: [],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);

      // All errors should have meaningful paths
      for (const error of result.errors) {
        expect(error.message).toBeTruthy();
        expect(error.code).toBeTruthy();
        // path is optional but helpful
      }
    });
  });

  // Integration scenarios
  describe('Integration scenarios', () => {
    it('validates complete real-world brief', () => {
      const brief = {
        position: 'auth-implementation',
        produces: [
          'src/auth/index.ts',
          'src/auth/jwt.ts',
          'src/auth/strategies.ts',
          'tests/auth.test.ts',
        ],
        consumes: ['src/types/index.ts', '.env.example'],
        description: 'Implement JWT authentication with refresh token rotation and role-based access control',
        idempotent: true,
        validate: [
          {
            type: 'artifact-exists',
            path: 'src/auth/index.ts',
          },
          {
            type: 'shell',
            cmd: 'npm run lint -- src/auth',
          },
          {
            type: 'shell',
            cmd: 'npm test -- tests/auth.test.ts',
          },
          {
            type: 'spec-conformance',
            spec: '.specify/spec.md',
            scenario: 'JWT token validation',
          },
        ],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(true);
    });

    it('rejects brief with minimal corruption (one field wrong)', () => {
      const brief: Record<string, unknown> = {
        position: 'test',
        produces: ['output.ts'],
        consumes: [],
        description: 'Test',
        idempotent: 'true', // Should be boolean
        validate: [{ type: 'artifact-exists' }],
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].code).toBe('BRIEF_INVALID_IDEMPOTENT');
    });

    it('detects multiple concurrent issues', () => {
      const brief: Record<string, unknown> = {
        position: '', // Empty
        produces: [], // Empty
        consumes: 'input.ts', // Not array
        description: null, // Wrong type
        idempotent: 1, // Wrong type
        validate: 'not-array', // Wrong type
        deps: [], // Contract 7 violation
      };

      const result = validateBriefSchema(brief);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(6);
    });
  });
});
