// @module protocol/operations
// @exports define, verify, check, reconcile, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, mergeCheck, branchWithWitness, merge, branch, analyze, modify, modifyAndCommit
// @types LoopSignal, PlanReceipt, Orientation, ReadyNode, NextBatch, BatchConflict, MergeConflict, BranchWitness, ModifyAnalysis, ModificationRecord

// Thin re-export layer. Pure algebra lives in src/core/.
// Only modifyAndCommit (IO) remains here.

import type { Graph } from './types.ts';

// --- Re-exports from core/ ---

export { define, verify, check } from '../../core/graph.ts';
export type { Flat } from '../../core/graph.ts';

export { order, parallelOrder, criticalPath, batchConflicts } from '../../core/order.ts';
export type { BatchConflict } from '../../core/order.ts';

export { orient } from '../../core/orient.ts';
export type { LoopSignal, PlanReceipt, Orientation } from '../../core/orient.ts';

export { advanceBatch, readyNodes, nextBatch } from '../../core/batch.ts';
export type { ReadyNode, NextBatch } from '../../core/batch.ts';

export { reconcile, mergeCheck, branchWithWitness, merge, branch, analyze, modify } from '../../core/reconcile.ts';
export type { MergeConflict, BranchWitness, ModifyAnalysis } from '../../core/reconcile.ts';

// --- ModificationRecord (type only, kept here for backward compat) ---

export interface ModificationRecord {
  timestamp: number;
  action: 'delete' | 'skip';
  nodeId: string;
  reason: string;
  evidence?: string;
  commitHash?: string;
  graphAfter?: Graph<string>;
}

// --- modifyAndCommit: IO function, cannot live in core/ ---

import { modify } from '../../core/reconcile.ts';

export async function modifyAndCommit(
  g: Graph<any>,
  nodeId: string,
  action: 'delete' | 'skip',
  reason: string,
  repoRoot: string,
  evidence?: string,
): Promise<{ success: boolean; graph?: Graph<any>; commitHash?: string; error?: string }> {
  const modResult = modify(g, nodeId, action);
  if (modResult instanceof Error) {
    return { success: false, error: modResult.message };
  }

  try {
    const { execSync } = await import('node:child_process');
    const { writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const roadmapPath = join(repoRoot, 'roadmap.ts');
    const roadmapContent = `export default ${JSON.stringify(modResult, null, 2)};\n`;

    writeFileSync(roadmapPath, roadmapContent);

    execSync(`git add roadmap.ts`, { cwd: repoRoot, stdio: 'ignore' });
    const commitMsg = `roadmap: ${action} ${nodeId} — ${reason}`;
    execSync(`git commit -m "${commitMsg}"`, { cwd: repoRoot, stdio: 'ignore' });

    const commitHash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

    return { success: true, graph: modResult, commitHash };
  } catch (e) {
    return { success: false, error: `Commit failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
