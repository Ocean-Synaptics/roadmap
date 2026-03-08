// @module core/orient
// @exports orient, LoopSignal, PlanReceipt, Orientation
// @types LoopSignal, PlanReceipt, Orientation
// @entry roadmap

// Pure orient: graph + completion store -> batch position. Zero IO imports.

import type { Graph } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';
import type { CompletionStore } from '../lib/protocol/types.ts';
import { flat } from './graph.ts';
import { parallelOrder } from './order.ts';

// --- Types ---

export interface LoopSignal {
  target: string;
  convergenceCheck?: { maxCoverageDelta?: number; requireEmptyProposals?: boolean };
}

export interface PlanReceipt {
  nodeId: string;
  mode: 'plan';
  preGateActive: boolean;
  expandedChildren: string[];
}

export interface Orientation {
  position: string[];
  level: number;
  batchRemaining: string[];
  batchComplete: boolean;
  preGate: string[];
  done: string[];
  produces: readonly string[];
  consumes: readonly string[];
  remaining: string[];
  loop?: LoopSignal;
  planReceipts?: PlanReceipt[];
  intentPolicyActive?: boolean;
}

// --- orient: agent reorientation ---

export function orient<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Orientation {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const done: string[] = [];

  // Build expansion index: plan node -> children expanded from it
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  for (const batch of batches) {
    const batchIncomplete = batch.filter(id => {
      if (retired?.has(id)) return false;
      const node = nm.get(id)!;
      if (node.mode === 'plan') {
        if (completion.hasPassing(id)) return false;
        const children = expansionChildren.get(id) ?? [];
        return children.length === 0;
      }
      return !completion.hasPassing(id);
    });

    if (batchIncomplete.length > 0) {
      const batchDone = batch.filter(id => !batchIncomplete.includes(id));
      const remainingBatches = batches.slice(batches.indexOf(batch) + 1).flat();
      const batchProduces = batch.flatMap(id => nm.get(id)!.produces);
      const batchConsumes = batch.flatMap(id => nm.get(id)!.consumes.map(consumeArtifact));
      const doneSet = new Set([...done, ...batchDone]);

      // Pre-gate: plan nodes in future batches workable before deps close
      const preGate: string[] = [];
      for (const id of remainingBatches) {
        const node = nm.get(id)!;
        if (node.mode !== 'plan') continue;
        if (retired?.has(id)) continue;
        const planDepsBlocking = node.deps.some(depId => {
          const dep = nm.get(depId as string);
          return dep?.mode === 'plan' && !doneSet.has(depId as string);
        });
        if (!planDepsBlocking) preGate.push(id);
      }

      // Detect loop signals in current batch
      const loopNode = batch.map(id => nm.get(id)!).find(n => n.loopTarget);
      const loop = loopNode ? { target: loopNode.loopTarget!, ...(loopNode.convergenceCheck ? { convergenceCheck: loopNode.convergenceCheck } : {}) } : undefined;

      // Plan receipts (FR-ORIENT-001)
      const planReceiptsArr: PlanReceipt[] = batch
        .map(id => nm.get(id)!)
        .filter(n => n.mode === 'plan')
        .map(n => ({
          nodeId: n.id,
          mode: 'plan' as const,
          preGateActive: preGate.includes(n.id),
          expandedChildren: expansionChildren.get(n.id) ?? [],
        }));

      return {
        position: batch,
        level: batches.indexOf(batch),
        batchRemaining: batchIncomplete,
        batchComplete: false,
        preGate,
        done: [...done, ...batchDone],
        produces: batchProduces,
        consumes: batchConsumes,
        remaining: remainingBatches,
        ...(loop ? { loop } : {}),
        ...(planReceiptsArr.length > 0 ? { planReceipts: planReceiptsArr } : {}),
      };
    }

    done.push(...batch);
  }

  // All batches complete
  const termNode = nm.get(g.term);
  const termLoop = termNode?.loopTarget
    ? { target: termNode.loopTarget, ...(termNode.convergenceCheck ? { convergenceCheck: termNode.convergenceCheck } : {}) }
    : undefined;

  return {
    position: [],
    level: batches.length,
    batchRemaining: [],
    batchComplete: true,
    preGate: [],
    done,
    produces: [],
    consumes: [],
    remaining: [],
    ...(termLoop ? { loop: termLoop } : {}),
  };
}
