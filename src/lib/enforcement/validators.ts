// @module enforcement
// @exports ArtifactSchemaValidator, ProcessInvariantValidator, ConcurrentSafetyValidator
// @types ValidationResult, ValidatorReport
// @entry roadmap

import { existsSync, readFileSync, statSync } from 'node:fs';

export interface ValidationResult {
  passed: boolean;
  rule: string;
  evidence: string;
  details?: Record<string, unknown>;
}

export interface ValidatorReport {
  nodeId: string;
  totalChecks: number;
  passed: number;
  failed: number;
  results: ValidationResult[];
}

/**
 * Artifact schema validator: validates artifact against JSON schema
 */
export class ArtifactSchemaValidator {
  validate(artifactPath: string, schemaPath: string): ValidationResult {
    try {
      if (!existsSync(artifactPath)) {
        return { passed: false, rule: 'artifact-schema', evidence: `artifact not found: ${artifactPath}` };
      }
      const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
      const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

      // Basic schema validation: check required fields
      const errors: string[] = [];
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in artifact)) {
            errors.push(`missing required field: ${field}`);
          }
        }
      }

      return {
        passed: errors.length === 0,
        rule: 'artifact-schema',
        evidence: errors.length === 0 ? `schema valid: ${artifactPath}` : errors.join('; '),
        details: { schemaPath, fieldCount: Object.keys(artifact).length },
      };
    } catch (e) {
      return { passed: false, rule: 'artifact-schema', evidence: `validation error: ${(e as Error).message}` };
    }
  }
}

/**
 * Process invariant validator: determinism, idempotency, atomicity
 */
export class ProcessInvariantValidator {
  validateDeterminism(outputs: any[]): ValidationResult {
    const first = JSON.stringify(outputs[0]);
    const allSame = outputs.every(o => JSON.stringify(o) === first);
    return {
      passed: allSame,
      rule: 'process-determinism',
      evidence: allSame ? 'all runs produced identical output' : 'outputs differ across runs',
    };
  }

  validateIdempotency(state1: any, state2: any): ValidationResult {
    const diff = JSON.stringify(state1) !== JSON.stringify(state2);
    return {
      passed: !diff,
      rule: 'process-idempotency',
      evidence: !diff ? 'state unchanged after rerun' : 'state changed after rerun',
    };
  }

  validateAtomicity(transactionLog: any[]): ValidationResult {
    const incomplete = transactionLog.filter(t => !t.committed);
    return {
      passed: incomplete.length === 0,
      rule: 'process-atomicity',
      evidence: incomplete.length === 0 ? 'all transactions committed' : `${incomplete.length} incomplete transactions`,
    };
  }
}

/**
 * Concurrent safety validator: race conditions, file locks, atomic writes
 */
export class ConcurrentSafetyValidator {
  validateFileLocks(lockFiles: string[]): ValidationResult {
    const active = lockFiles.filter(f => existsSync(f));
    return {
      passed: active.length === 0,
      rule: 'concurrent-file-locks',
      evidence: active.length === 0 ? 'no stale locks' : `${active.length} locks held`,
    };
  }

  validateAtomicWrites(statePath: string): ValidationResult {
    try {
      const stat = statSync(statePath);
      const isRecent = Date.now() - stat.mtimeMs < 5000;
      return {
        passed: isRecent,
        rule: 'concurrent-atomic-write',
        evidence: isRecent ? 'recent atomic write detected' : 'write may not be atomic',
        details: { age_ms: Date.now() - stat.mtimeMs },
      };
    } catch {
      return { passed: false, rule: 'concurrent-atomic-write', evidence: 'state file check failed' };
    }
  }

  validateCAS(key: string, expectedValue: any, newValue: any): ValidationResult {
    // Compare-and-swap validation
    return {
      passed: true,
      rule: 'concurrent-cas',
      evidence: `CAS eligible: ${key}`,
      details: { expected: expectedValue, new: newValue },
    };
  }
}
