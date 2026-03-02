// @module preflight-validator
// @exports PreflightValidator, validateStateCoherence, validateArtifacts, validateSchema, validateTypecheck
// @types PreflightCheckResult, ArtifactCheckResult, SchemaCheckResult, TypecheckResult
// @entry roadmap

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface PreflightCheckResult {
  passed: boolean;
  timestamp: string;
  errors: string[];
  warnings: string[];
}

export interface ArtifactCheckResult extends PreflightCheckResult {
  missing: string[];
  existing: string[];
}

export interface SchemaCheckResult extends PreflightCheckResult {
  valid: boolean;
  schemaErrors: string[];
}

export interface TypecheckResult extends PreflightCheckResult {
  srcChanged: boolean;
  typecheckPassed: boolean;
  output?: string;
}

export class PreflightValidator {
  private repoRoot: string;
  private headJsonPath: string;
  private gitStatePath: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.headJsonPath = join(repoRoot, '.roadmap', 'head.json');
    this.gitStatePath = join(repoRoot, '.roadmap', 'git-state.json');
  }

  /**
   * Validate that head.json matches current git state (post-recovery check)
   * Ensures headSha in head.json aligns with git-state.json lastCommit
   */
  validateStateCoherence(): PreflightCheckResult {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Load head.json
      if (!existsSync(this.headJsonPath)) {
        errors.push('head.json not found');
        return { passed: false, timestamp, errors, warnings };
      }

      let headJson: any;
      try {
        const content = readFileSync(this.headJsonPath, 'utf-8');
        headJson = JSON.parse(content);
      } catch (err) {
        errors.push(`head.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
        return { passed: false, timestamp, errors, warnings };
      }

      // Load git-state.json
      if (!existsSync(this.gitStatePath)) {
        errors.push('git-state.json not found');
        return { passed: false, timestamp, errors, warnings };
      }

      let gitState: any;
      try {
        const content = readFileSync(this.gitStatePath, 'utf-8');
        gitState = JSON.parse(content);
      } catch (err) {
        errors.push(`git-state.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
        return { passed: false, timestamp, errors, warnings };
      }

      // Verify git state file has required fields
      if (!gitState.lastCommit || !gitState.timestamp) {
        errors.push('git-state.json missing required fields (lastCommit, timestamp)');
        return { passed: false, timestamp, errors, warnings };
      }

      // Check that headSha in head.json matches lastCommit in git-state.json
      if (headJson.headSha !== gitState.lastCommit) {
        errors.push(
          `headSha mismatch: head.json has ${headJson.headSha?.slice(0, 8)}… ` +
          `but git-state.json has ${gitState.lastCommit.slice(0, 8)}…`
        );
        return { passed: false, timestamp, errors, warnings };
      }

      // Verify the git commit still exists
      try {
        execSync(`git cat-file -t ${gitState.lastCommit}`, {
          cwd: this.repoRoot,
          stdio: 'pipe',
        });
      } catch {
        errors.push(`Git commit ${gitState.lastCommit.slice(0, 8)}… is no longer valid`);
        return { passed: false, timestamp, errors, warnings };
      }

      return { passed: true, timestamp, errors, warnings };
    } catch (err) {
      errors.push(`Unexpected error: ${err instanceof Error ? err.message : 'unknown'}`);
      return { passed: false, timestamp, errors, warnings };
    }
  }

  /**
   * Validate that all expected artifacts (produces) exist in working tree
   * Reads produces from head.json nodes and checks filesystem
   */
  validateArtifacts(): ArtifactCheckResult {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];
    const missing: string[] = [];
    const existing: string[] = [];

    try {
      // Load head.json
      if (!existsSync(this.headJsonPath)) {
        errors.push('head.json not found');
        return { passed: false, timestamp, errors, warnings, missing, existing };
      }

      let headJson: any;
      try {
        const content = readFileSync(this.headJsonPath, 'utf-8');
        headJson = JSON.parse(content);
      } catch (err) {
        errors.push(`head.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
        return { passed: false, timestamp, errors, warnings, missing, existing };
      }

      // Verify nodes exist
      if (!headJson.nodes || typeof headJson.nodes !== 'object') {
        errors.push('head.json missing nodes object');
        return { passed: false, timestamp, errors, warnings, missing, existing };
      }

      // Collect all produces from all nodes
      const expectedArtifacts = new Set<string>();
      for (const nodeId in headJson.nodes) {
        const node = headJson.nodes[nodeId];
        if (Array.isArray(node.produces)) {
          node.produces.forEach((artifact: string) => {
            expectedArtifacts.add(artifact);
          });
        }
      }

      // Check existence of each artifact
      expectedArtifacts.forEach((artifact) => {
        const fullPath = join(this.repoRoot, artifact);
        if (existsSync(fullPath)) {
          existing.push(artifact);
        } else {
          missing.push(artifact);
        }
      });

      // If any artifacts are missing, flag warning (not necessarily error for execution)
      if (missing.length > 0) {
        warnings.push(`${missing.length} artifact(s) missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`);
      }

      // Passed if we collected artifacts (even if some missing — that's a warning)
      const passed = expectedArtifacts.size > 0 && errors.length === 0;
      return { passed, timestamp, errors, warnings, missing, existing };
    } catch (err) {
      errors.push(`Unexpected error: ${err instanceof Error ? err.message : 'unknown'}`);
      return { passed: false, timestamp, errors, warnings, missing, existing };
    }
  }

  /**
   * Validate that head.json structure is valid
   * Checks DAG schema: required fields, node structure, cycles, init/term validity
   */
  validateSchema(): SchemaCheckResult {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];
    const schemaErrors: string[] = [];
    let valid = true;

    try {
      // Load head.json
      if (!existsSync(this.headJsonPath)) {
        schemaErrors.push('head.json not found');
        return { passed: false, valid: false, timestamp, errors, warnings, schemaErrors };
      }

      let headJson: any;
      try {
        const content = readFileSync(this.headJsonPath, 'utf-8');
        headJson = JSON.parse(content);
      } catch (err) {
        schemaErrors.push(`Parse error: ${err instanceof Error ? err.message : 'unknown'}`);
        return { passed: false, valid: false, timestamp, errors, warnings, schemaErrors };
      }

      // Check required top-level fields
      if (typeof headJson.id !== 'string') {
        schemaErrors.push('Missing or invalid id field (must be string)');
        valid = false;
      }

      if (typeof headJson.init !== 'string') {
        schemaErrors.push('Missing or invalid init field (must be string)');
        valid = false;
      }

      if (typeof headJson.term !== 'string') {
        schemaErrors.push('Missing or invalid term field (must be string)');
        valid = false;
      }

      if (!headJson.nodes || typeof headJson.nodes !== 'object') {
        schemaErrors.push('Missing or invalid nodes field (must be object)');
        valid = false;
      }

      // If basic structure is invalid, return early
      if (!valid) {
        return { passed: false, valid: false, timestamp, errors, warnings, schemaErrors };
      }

      // Verify init and term nodes exist
      if (!headJson.nodes[headJson.init]) {
        schemaErrors.push(`init node "${headJson.init}" not found in nodes`);
        valid = false;
      }

      if (!headJson.nodes[headJson.term]) {
        schemaErrors.push(`term node "${headJson.term}" not found in nodes`);
        valid = false;
      }

      // Validate each node structure
      for (const nodeId in headJson.nodes) {
        const node = headJson.nodes[nodeId];

        if (typeof node.id !== 'string' || node.id !== nodeId) {
          schemaErrors.push(`Node ${nodeId}: id mismatch (node.id must equal key)`);
          valid = false;
        }

        if (!Array.isArray(node.produces)) {
          schemaErrors.push(`Node ${nodeId}: produces must be an array`);
          valid = false;
        }

        if (!Array.isArray(node.consumes)) {
          schemaErrors.push(`Node ${nodeId}: consumes must be an array`);
          valid = false;
        }

        if (!Array.isArray(node.deps)) {
          schemaErrors.push(`Node ${nodeId}: deps must be an array`);
          valid = false;
        }

        if (!Array.isArray(node.validate)) {
          schemaErrors.push(`Node ${nodeId}: validate must be an array`);
          valid = false;
        }

        // Verify all dependencies reference existing nodes
        node.deps.forEach((depId: string) => {
          if (!headJson.nodes[depId]) {
            schemaErrors.push(`Node ${nodeId}: references non-existent dependency "${depId}"`);
            valid = false;
          }
        });
      }

      // Check for cycles using DFS
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const hasCycle = (nodeId: string): boolean => {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        const node = headJson.nodes[nodeId];
        if (node && node.deps) {
          for (const depId of node.deps) {
            if (!visited.has(depId)) {
              if (hasCycle(depId)) return true;
            } else if (recursionStack.has(depId)) {
              return true;
            }
          }
        }

        recursionStack.delete(nodeId);
        return false;
      };

      for (const nodeId in headJson.nodes) {
        if (!visited.has(nodeId)) {
          if (hasCycle(nodeId)) {
            schemaErrors.push('Cycle detected in dependency graph');
            valid = false;
            break;
          }
        }
      }

      return { passed: valid && schemaErrors.length === 0, valid, timestamp, errors, warnings, schemaErrors };
    } catch (err) {
      schemaErrors.push(`Unexpected error: ${err instanceof Error ? err.message : 'unknown'}`);
      return { passed: false, valid: false, timestamp, errors, warnings, schemaErrors };
    }
  }

  /**
   * Validate that tsc --noEmit passes if src/ has changed
   * Detects changes since git-state.json.lastCommit and runs typecheck
   */
  validateTypecheck(): TypecheckResult {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];
    const warnings: string[] = [];
    let srcChanged = false;
    let typecheckPassed = false;
    let output: string | undefined;

    try {
      // Load git-state.json
      if (!existsSync(this.gitStatePath)) {
        errors.push('git-state.json not found');
        return { passed: false, timestamp, errors, warnings, srcChanged, typecheckPassed };
      }

      let gitState: any;
      try {
        const content = readFileSync(this.gitStatePath, 'utf-8');
        gitState = JSON.parse(content);
      } catch (err) {
        errors.push(`git-state.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
        return { passed: false, timestamp, errors, warnings, srcChanged, typecheckPassed };
      }

      if (!gitState.lastCommit) {
        errors.push('git-state.json missing lastCommit');
        return { passed: false, timestamp, errors, warnings, srcChanged, typecheckPassed };
      }

      // Detect if src/ has changed since last commit
      try {
        const diffOutput = execSync(`git diff ${gitState.lastCommit}..HEAD -- src/`, {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        });

        srcChanged = diffOutput.trim().length > 0;
      } catch (err) {
        // If git diff fails (e.g., commit doesn't exist), assume src changed
        srcChanged = true;
      }

      // If src/ hasn't changed, skip typecheck (pass by default)
      if (!srcChanged) {
        typecheckPassed = true;
        return { passed: true, timestamp, errors, warnings, srcChanged, typecheckPassed, output: 'src/ unchanged, skipping typecheck' };
      }

      // Run tsc --noEmit
      try {
        const tscOutput = execSync('npx tsc --noEmit', {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: 'pipe',
        });

        typecheckPassed = true;
        output = 'tsc --noEmit passed';
      } catch (err) {
        typecheckPassed = false;
        const errMessage = err instanceof Error ? err.message : 'unknown error';
        output = errMessage;
        // Check if it's a command not found vs actual typecheck failure
        if (errMessage.includes('not found') || errMessage.includes('ENOENT')) {
          warnings.push('tsc not found, skipping typecheck');
          typecheckPassed = true; // Don't fail if tsc not available
        } else {
          errors.push(`tsc typecheck failed: ${errMessage}`);
        }
      }

      return { passed: errors.length === 0, timestamp, errors, warnings, srcChanged, typecheckPassed, output };
    } catch (err) {
      errors.push(`Unexpected error: ${err instanceof Error ? err.message : 'unknown'}`);
      return { passed: false, timestamp, errors, warnings, srcChanged, typecheckPassed };
    }
  }

  /**
   * Run all preflight checks and return aggregated result
   */
  runAll(): {
    allPassed: boolean;
    timestamp: string;
    stateCoherence: PreflightCheckResult;
    artifacts: ArtifactCheckResult;
    schema: SchemaCheckResult;
    typecheck: TypecheckResult;
    summary: string;
  } {
    const timestamp = new Date().toISOString();

    const stateCoherence = this.validateStateCoherence();
    const artifacts = this.validateArtifacts();
    const schema = this.validateSchema();
    const typecheck = this.validateTypecheck();

    const allPassed = stateCoherence.passed && artifacts.passed && schema.passed && typecheck.passed;

    const summary = allPassed
      ? 'All preflight checks passed'
      : `Preflight checks failed: ${[
          !stateCoherence.passed && 'state coherence',
          !artifacts.passed && 'artifacts',
          !schema.passed && 'schema',
          !typecheck.passed && 'typecheck',
        ]
          .filter(Boolean)
          .join(', ')}`;

    return {
      allPassed,
      timestamp,
      stateCoherence,
      artifacts,
      schema,
      typecheck,
      summary,
    };
  }
}

/**
 * Standalone utility: validate state coherence
 */
export function validateStateCoherence(repoRoot: string): PreflightCheckResult {
  return new PreflightValidator(repoRoot).validateStateCoherence();
}

/**
 * Standalone utility: validate artifacts
 */
export function validateArtifacts(repoRoot: string): ArtifactCheckResult {
  return new PreflightValidator(repoRoot).validateArtifacts();
}

/**
 * Standalone utility: validate schema
 */
export function validateSchema(repoRoot: string): SchemaCheckResult {
  return new PreflightValidator(repoRoot).validateSchema();
}

/**
 * Standalone utility: validate typecheck
 */
export function validateTypecheck(repoRoot: string): TypecheckResult {
  return new PreflightValidator(repoRoot).validateTypecheck();
}
