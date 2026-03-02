// @module artifact-gates
// @exports ArtifactGates, GateResult, validateArtifactGates
// @types GateResult, ArtifactGateConfig
// @entry roadmap

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export interface GateResult {
  gate: 'artifact-exists' | 'artifact-typecheck' | 'artifact-schema' | 'artifact-hash';
  passed: boolean;
  evidence: string;
  severity: 'error' | 'warning';
  error?: string;
}

export interface ArtifactGateConfig {
  produces?: string[];
  srcPath?: string;
  schema?: string;
  artifactPath?: string;
  expectedHash?: string;
}

/**
 * ArtifactGates orchestrates validation of produced artifacts before node completion.
 * Gates are applied in sequence and must all pass for completion to proceed.
 */
export class ArtifactGates {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Check that all declared produces files exist in the working tree.
   * This is the primary gate before completion: if artifacts don't exist, completion fails.
   */
  checkExists(produces: string[]): GateResult {
    if (!produces || produces.length === 0) {
      return {
        gate: 'artifact-exists',
        passed: true,
        evidence: 'no artifacts required',
        severity: 'warning',
      };
    }

    const missing: string[] = [];
    const existing: string[] = [];

    for (const artifact of produces) {
      const fullPath = join(this.repoRoot, artifact);
      if (existsSync(fullPath)) {
        existing.push(artifact);
      } else {
        missing.push(artifact);
      }
    }

    if (missing.length > 0) {
      return {
        gate: 'artifact-exists',
        passed: false,
        evidence: `missing artifacts: ${missing.join(', ')}`,
        severity: 'error',
        error: `${missing.length} artifact(s) not found in working tree`,
      };
    }

    return {
      gate: 'artifact-exists',
      passed: true,
      evidence: `all artifacts exist: ${existing.join(', ')}`,
      severity: 'warning',
    };
  }

  /**
   * Check that TypeScript compilation passes (tsc --noEmit).
   * Skips if src/ hasn't changed or if ROADMAP_VALIDATING is set (prevent recursion).
   */
  checkTypecheck(srcPath: string = 'src'): GateResult {
    // Guard against recursive validation: if we're already inside a validation run,
    // skip typecheck to prevent infinite recursion
    if (process.env.ROADMAP_VALIDATING === '1') {
      return {
        gate: 'artifact-typecheck',
        passed: true,
        evidence: 'skipped (already inside validation)',
        severity: 'warning',
      };
    }

    const srcFullPath = join(this.repoRoot, srcPath);

    // Check if src/ exists
    if (!existsSync(srcFullPath)) {
      return {
        gate: 'artifact-typecheck',
        passed: true,
        evidence: `src path not found: ${srcPath}; skipping typecheck`,
        severity: 'warning',
      };
    }

    try {
      // Run tsc --noEmit with recursion guard
      execSync('npx tsc --noEmit', {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, ROADMAP_VALIDATING: '1' },
      });

      return {
        gate: 'artifact-typecheck',
        passed: true,
        evidence: 'tsc --noEmit passed',
        severity: 'warning',
      };
    } catch (err) {
      const stderr = err instanceof Error ? err.message : 'unknown error';
      const shortError = stderr.split('\n').slice(0, 3).join('\n');

      return {
        gate: 'artifact-typecheck',
        passed: false,
        evidence: `tsc --noEmit failed: ${shortError}`,
        severity: 'error',
        error: `TypeScript compilation failed. Run 'tsc --noEmit' for full output`,
      };
    }
  }

  /**
   * Validate JSON artifact against a schema.
   * Currently stubbed; schema validation deferred to future phase.
   */
  checkSchema(artifactPath: string, schema: string): GateResult {
    // Stub: schema validation to be implemented in future iteration
    return {
      gate: 'artifact-schema',
      passed: true,
      evidence: 'schema validation not yet implemented',
      severity: 'warning',
    };
  }

  /**
   * Validate artifact hash matches expected value (immutability check).
   * Currently stubbed; hash validation deferred to future phase.
   */
  checkHash(artifactPath: string, expectedHash: string): GateResult {
    // Stub: hash validation to be implemented in future iteration
    return {
      gate: 'artifact-hash',
      passed: true,
      evidence: 'hash validation not yet implemented',
      severity: 'warning',
    };
  }

  /**
   * Run artifact gates before node completion.
   * Returns array of GateResults; all must pass for completion to proceed.
   *
   * Gates run in order:
   * 1. artifact-exists: check produces exist
   * 2. artifact-typecheck: check TypeScript compilation
   * 3. artifact-schema: verify JSON schemas (stubbed)
   * 4. artifact-hash: verify immutability (stubbed)
   */
  async validateBeforeCompletion(
    nodeId: string,
    config: ArtifactGateConfig,
  ): Promise<GateResult[]> {
    const results: GateResult[] = [];

    // Gate 1: artifact-exists
    if (config.produces && config.produces.length > 0) {
      results.push(this.checkExists(config.produces));
    }

    // Gate 2: artifact-typecheck
    results.push(this.checkTypecheck(config.srcPath));

    // Gate 3: artifact-schema (stubbed)
    if (config.artifactPath && config.schema) {
      results.push(this.checkSchema(config.artifactPath, config.schema));
    }

    // Gate 4: artifact-hash (stubbed)
    if (config.artifactPath && config.expectedHash) {
      results.push(this.checkHash(config.artifactPath, config.expectedHash));
    }

    return results;
  }

  /**
   * Determine if all gates passed (for completion decision).
   */
  allGatesPassed(results: GateResult[]): boolean {
    return results.every((r) => r.passed);
  }

  /**
   * Format gate results for human-readable output.
   */
  formatResults(results: GateResult[]): string {
    if (results.length === 0) {
      return '(no gates run)';
    }

    return results
      .map((r) => {
        const status = r.passed ? '✓' : '✗';
        const msg = r.error ? `${r.evidence} — ${r.error}` : r.evidence;
        return `  ${status} ${r.gate}: ${msg}`;
      })
      .join('\n');
  }
}

/**
 * Standalone utility: validate artifacts for a node before completion.
 */
export async function validateArtifactGates(
  repoRoot: string,
  nodeId: string,
  config: ArtifactGateConfig,
): Promise<GateResult[]> {
  const gates = new ArtifactGates(repoRoot);
  return gates.validateBeforeCompletion(nodeId, config);
}
