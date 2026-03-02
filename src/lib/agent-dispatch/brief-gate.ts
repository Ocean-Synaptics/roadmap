// @module agent-dispatch
// @exports validateBrief, Brief, BriefValidationError

/**
 * Sealed brief contract.
 * Agents receive only this slice of the DAG — no introspection into full execution graph.
 */
export interface Brief {
  position: string;           // Current node-id
  produces: string[];         // Files to create
  consumes: string[];         // Files to read
  description: string;        // What to implement
  idempotent: boolean;        // Whether safe to re-run
  validate: ValidationRule[]; // How to verify completion
}

export interface ValidationRule {
  type: 'artifact-exists' | 'shell' | 'spec-conformance';
  [key: string]: unknown;
}

export class BriefValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BriefValidationError';
  }
}

/**
 * Validate brief contract before agent dispatch.
 * Throws BriefValidationError if brief is malformed or incomplete.
 */
export function validateBrief(brief: unknown): asserts brief is Brief {
  if (!brief || typeof brief !== 'object') {
    throw new BriefValidationError('BRIEF_NOT_OBJECT', 'Brief must be an object');
  }

  const b = brief as Record<string, unknown>;

  // Required fields
  const required = ['position', 'produces', 'consumes', 'description', 'idempotent', 'validate'];
  for (const field of required) {
    if (!(field in b)) {
      throw new BriefValidationError('MISSING_FIELD', `Brief missing required field: ${field}`, { field });
    }
  }

  // Type checks
  if (typeof b.position !== 'string') {
    throw new BriefValidationError('INVALID_POSITION', 'position must be string', { got: typeof b.position });
  }

  if (!Array.isArray(b.produces)) {
    throw new BriefValidationError('INVALID_PRODUCES', 'produces must be array', { got: typeof b.produces });
  }

  if (!Array.isArray(b.consumes)) {
    throw new BriefValidationError('INVALID_CONSUMES', 'consumes must be array', { got: typeof b.consumes });
  }

  if (typeof b.description !== 'string') {
    throw new BriefValidationError('INVALID_DESCRIPTION', 'description must be string', { got: typeof b.description });
  }

  if (typeof b.idempotent !== 'boolean') {
    throw new BriefValidationError('INVALID_IDEMPOTENT', 'idempotent must be boolean', { got: typeof b.idempotent });
  }

  if (!Array.isArray(b.validate)) {
    throw new BriefValidationError('INVALID_VALIDATE', 'validate must be array', { got: typeof b.validate });
  }

  // Validate produce/consume lists
  if (b.produces.length === 0) {
    throw new BriefValidationError('EMPTY_PRODUCES', 'produces list cannot be empty');
  }

  if (!b.produces.every(p => typeof p === 'string')) {
    throw new BriefValidationError('INVALID_PRODUCE_PATH', 'All produces must be strings');
  }

  if (!b.consumes.every(c => typeof c === 'string')) {
    throw new BriefValidationError('INVALID_CONSUME_PATH', 'All consumes must be strings');
  }

  // Validate rules
  if (!b.validate.every((r: unknown) => r && typeof r === 'object' && 'type' in (r as object))) {
    throw new BriefValidationError('INVALID_RULE', 'All validate rules must have type field');
  }
}
