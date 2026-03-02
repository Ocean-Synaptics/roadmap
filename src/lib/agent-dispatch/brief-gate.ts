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

export interface BriefValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate brief contract before agent dispatch.
 * Returns validation result with error details if invalid.
 */
export function validateBrief(
  brief: unknown,
  consumes?: Array<{ file: string; available: boolean }>
): BriefValidation {
  const errors: string[] = [];

  if (!brief || typeof brief !== 'object') {
    return { valid: false, errors: ['Brief must be an object'] };
  }

  const b = brief as Record<string, unknown>;

  // Required fields
  const required = ['position', 'produces', 'consumes', 'description', 'idempotent', 'validate'];
  for (const field of required) {
    if (!(field in b)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Type checks
  if (typeof b.position !== 'string') {
    errors.push(`position must be string, got ${typeof b.position}`);
  }

  if (!Array.isArray(b.produces)) {
    errors.push(`produces must be array, got ${typeof b.produces}`);
  }

  if (!Array.isArray(b.consumes)) {
    errors.push(`consumes must be array, got ${typeof b.consumes}`);
  }

  if (typeof b.description !== 'string') {
    errors.push(`description must be string, got ${typeof b.description}`);
  }

  if (typeof b.idempotent !== 'boolean') {
    errors.push(`idempotent must be boolean, got ${typeof b.idempotent}`);
  }

  if (!Array.isArray(b.validate)) {
    errors.push(`validate must be array, got ${typeof b.validate}`);
  }

  // Check produce/consume lists
  if (Array.isArray(b.produces) && b.produces.length === 0) {
    errors.push('produces list cannot be empty');
  }

  if (Array.isArray(b.produces) && !b.produces.every(p => typeof p === 'string')) {
    errors.push('All produces must be strings');
  }

  if (Array.isArray(b.consumes) && !b.consumes.every(c => typeof c === 'string')) {
    errors.push('All consumes must be strings');
  }

  // Validate rules
  if (Array.isArray(b.validate) && !b.validate.every((r: unknown) => r && typeof r === 'object' && 'type' in (r as object))) {
    errors.push('All validate rules must have type field');
  }

  // Check consumed files availability if provided
  if (consumes) {
    const unavailable = consumes.filter(c => !c.available);
    if (unavailable.length > 0) {
      errors.push(`Consumed files not available: ${unavailable.map(c => c.file).join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
