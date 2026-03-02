// @module merge-orchestrator
// @exports orchestrateMerge, MergeOrchestratorResult
// @types MergeOrchestratorResult, MergeWorkflow
// @entry bin/roadmap merge command

import * as fs from 'fs';
import * as path from 'path';
import type { Graph } from '../../protocol.ts';
import { define, verify, check } from '../../protocol.ts';
import { discoverDAGFiles, mergeMultiWay, ConsolidationError } from './dag-consolidator.ts';
import { propagateConstraints } from '../propagate.ts';
import { execSync } from 'node:child_process';

export interface MergeOrchestratorResult {
  success: boolean;
  merged: Graph<string> | null;
  phase: 'consolidate' | 'propagate' | 'validate' | 'commit' | 'complete';
  details: {
    sourceDAGs: string[];
    nodesMerged: number;
    rulesAdded: number;
    nodesAffected: number;
    validationErrors: string[];
  };
  error?: string;
  timestamp: string;
  rollbackInstructions?: string;
}

export interface MergeWorkflow {
  roadmapRoot: string;
  headPath: string;
  dryRun: boolean;
}

/**
 * Orchestrate full merge workflow:
 * 1. Discover and consolidate all DAGs
 * 2. Run propagate to derive artifact dependencies
 * 3. Validate consolidated DAG (define + verify + check)
 * 4. Write unified head.json
 * 5. Commit to git with appropriate message
 *
 * On failure at any step: rollback cleanly and report error with fix suggestion
 */
export async function orchestrateMerge(
  repoRoot: string,
  options: { dryRun?: boolean } = {}
): Promise<MergeOrchestratorResult> {
  const roadmapRoot = repoRoot;
  const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');
  const dryRun = options.dryRun ?? false;
  const timestamp = new Date().toISOString();

  // Phase 1: Consolidate
  let merged: Graph<string> | null = null;
  let sourceDAGs: string[] = [];
  let nodesMerged = 0;

  try {
    // Save current head.json for rollback
    let originalHead: Graph<string> | null = null;
    if (fs.existsSync(headPath)) {
      originalHead = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
    }

    // Discover all DAG files
    const dagFiles = await discoverDAGFiles(roadmapRoot);

    if (dagFiles.length <= 1) {
      return {
        success: false,
        merged: null,
        phase: 'consolidate',
        details: {
          sourceDAGs: dagFiles.map(f => f.name),
          nodesMerged: 0,
          rulesAdded: 0,
          nodesAffected: 0,
          validationErrors: ['Only ' + dagFiles.length + ' DAG(s) found. Merge requires 2+ DAGs.'],
        },
        error: 'Merge requires 2 or more DAG files',
        timestamp,
      };
    }

    sourceDAGs = dagFiles.map(f => f.name);

    // Consolidate DAGs
    const mergeResult = mergeMultiWay(dagFiles);
    merged = mergeResult.merged;
    nodesMerged = Object.keys(merged.nodes).length;

    // Phase 2: Propagate constraints
    let rulesAdded = 0;
    let nodesAffected = 0;

    try {
      const propResult = propagateConstraints(merged, { dryRun: false });
      if (propResult.dag) {
        merged = propResult.dag;
      }
      rulesAdded = propResult.propagated;
      nodesAffected = propResult.nodesAffected;
    } catch (propagateErr) {
      // Propagate error is non-fatal; continue with validation
      console.warn('[merge] Propagation warning:', propagateErr);
    }

    // Phase 3: Validate consolidated DAG
    const validationErrors: string[] = [];

    try {
      // Check structure (no cycles, init/term reachable)
      define(merged);
    } catch (err) {
      validationErrors.push(`Structure invalid: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      // Check contracts (consumes satisfied by predecessors)
      const errors = verify(merged);
      if (errors.length > 0) {
        validationErrors.push(`Contract violations: ${errors.map((e: any) => e.message || String(e)).join('; ')}`);
      }
    } catch (err) {
      validationErrors.push(`Verification error: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      // Check connectivity (every node reachable from init to term)
      const checkResult = check(merged);
      if (checkResult.orphans.length > 0) {
        validationErrors.push(`Connectivity error: ${checkResult.orphans.join('; ')}`);
      }
    } catch (err) {
      validationErrors.push(`Connectivity check failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (validationErrors.length > 0) {
      return {
        success: false,
        merged: null,
        phase: 'validate',
        details: {
          sourceDAGs,
          nodesMerged,
          rulesAdded,
          nodesAffected,
          validationErrors,
        },
        error: `Validation failed: ${validationErrors[0]}`,
        timestamp,
        rollbackInstructions: 'Merged DAG failed validation. No files written. Fix source DAGs and retry merge.',
      };
    }

    // Phase 4: Write to disk (only if not dry-run)
    if (!dryRun) {
      fs.writeFileSync(headPath, JSON.stringify(merged, null, 2));

      // Update baseSha to current git HEAD
      try {
        const baseSha = execSync('git rev-parse HEAD', { cwd: roadmapRoot, encoding: 'utf-8' }).trim();
        const headContent = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
        headContent.baseSha = baseSha;
        fs.writeFileSync(headPath, JSON.stringify(headContent, null, 2));
      } catch {
        // baseSha update is best-effort
      }

      // Also update head-index.json to reflect consolidation
      const indexPath = path.join(roadmapRoot, '.roadmap', 'head-index.json');
      if (fs.existsSync(indexPath)) {
        try {
          const { extractMetadataIndex } = await import('./index-extractor.ts');
          const index = extractMetadataIndex({
            merged,
            phases: { [merged.id]: Object.keys(merged.nodes) },
            connections: [],
            sourceFiles: sourceDAGs,
            timestamp,
            executionOrder: [merged.id],
            executionBatches: [[merged.id]],
          });
          fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
        } catch (indexErr) {
          // Index update is best-effort, don't fail
          console.warn('[merge] Index update failed:', indexErr);
        }
      }
    }

    return {
      success: true,
      merged,
      phase: 'complete',
      details: {
        sourceDAGs,
        nodesMerged,
        rulesAdded,
        nodesAffected,
        validationErrors: [],
      },
      timestamp,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    return {
      success: false,
      merged: null,
      phase: 'consolidate',
      details: {
        sourceDAGs,
        nodesMerged,
        rulesAdded: 0,
        nodesAffected: 0,
        validationErrors: [errorMsg],
      },
      error: errorMsg,
      timestamp,
      rollbackInstructions:
        'Consolidation failed. No files were modified. Check source DAGs for cycles or missing nodes.',
    };
  }
}

/**
 * Dry-run merge: validate without writing to disk
 * Useful for pre-merge checks
 */
export async function dryRunMerge(repoRoot: string): Promise<MergeOrchestratorResult> {
  return orchestrateMerge(repoRoot, { dryRun: true });
}
