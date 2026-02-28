// @module verify
// @exports Violation, VerifyResult, runVerify
// @types Violation, VerifyResult
// @entry roadmap

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { define, check, verify } from '../protocol.ts';
import type { Graph } from '../protocol.ts';
import { loadCompletions, getCompletedNodeIds } from './completion-tracker.ts';

export interface Violation {
  code: string;
  message: string;
  paths?: string[];
  nodeIds?: string[];
  fix: string[];
}

export interface VerifyResult {
  violations: Violation[];
  warnings: Violation[];
  fix: string[];
}

// Structural validity: define() + check()
function checkStructure(dag: Graph<string>): Violation[] {
  const violations: Violation[] = [];
  try {
    define(dag);
  } catch (err) {
    violations.push({
      code: 'STRUCTURAL_INVALID',
      message: `DAG structural error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json structure — cycles, missing init/term, or id/key mismatches'],
    });
  }

  try {
    const result = check(dag);
    if (result.orphans.length > 0) {
      violations.push({
        code: 'ORPHAN_NODES',
        message: `${result.orphans.length} node(s) unreachable from init or cannot reach term`,
        nodeIds: result.orphans,
        fix: ['Add dependency edges to connect orphan nodes to the DAG'],
      });
    }
  } catch (err) {
    violations.push({
      code: 'CHECK_FAILED',
      message: `Termination check error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json DAG structure'],
    });
  }

  return violations;
}

// Contract validity: verify()
function checkContracts(dag: Graph<string>): Violation[] {
  try {
    const unsatisfied = verify(dag);
    if (unsatisfied.length === 0) return [];
    return [{
      code: 'UNSATISFIED_CONTRACTS',
      message: `${unsatisfied.length} unsatisfied consume contract(s)`,
      paths: unsatisfied,
      fix: ['Ensure every consumed artifact is produced by a predecessor node'],
    }];
  } catch (err) {
    return [{
      code: 'CONTRACT_CHECK_FAILED',
      message: `Contract verification error: ${String(err instanceof Error ? err.message : err)}`,
      fix: ['Fix head.json node consumes/produces declarations'],
    }];
  }
}

// CompletionStore consistency: completed nodes must exist in DAG
function checkCompletions(repoRoot: string, dag: Graph<string>): Violation[] {
  const warnings: Violation[] = [];
  const completions = loadCompletions(repoRoot);
  const completedIds = getCompletedNodeIds(completions);
  const dagNodeIds = new Set(Object.keys(dag.nodes));

  const orphanCompletions = [...completedIds].filter(id => !dagNodeIds.has(id));
  if (orphanCompletions.length > 0) {
    warnings.push({
      code: 'ORPHAN_COMPLETIONS',
      message: `${orphanCompletions.length} completion record(s) reference nodes not in the DAG`,
      nodeIds: orphanCompletions,
      fix: ['Remove stale entries from .roadmap/completed.json or re-add missing nodes'],
    });
  }

  return warnings;
}

export function runVerify(repoRoot: string): VerifyResult {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    return {
      violations: [{
        code: 'NO_DAG',
        message: 'No .roadmap/head.json found',
        paths: [headPath],
        fix: ['Run `roadmap init <dag-id>` or create head.json'],
      }],
      warnings: [],
      fix: ['roadmap init <dag-id>'],
    };
  }

  let dag: Graph<string>;
  try {
    dag = JSON.parse(readFileSync(headPath, 'utf-8'));
  } catch (err) {
    return {
      violations: [{
        code: 'DAG_PARSE_ERROR',
        message: `Failed to parse head.json: ${String(err instanceof Error ? err.message : err)}`,
        paths: [headPath],
        fix: ['Fix JSON syntax in .roadmap/head.json'],
      }],
      warnings: [],
      fix: ['Fix .roadmap/head.json'],
    };
  }

  const violations = [
    ...checkStructure(dag),
    ...checkContracts(dag),
  ];

  const warnings = checkCompletions(repoRoot, dag);

  const fix = violations.flatMap(v => v.fix);

  return { violations, warnings, fix };
}
