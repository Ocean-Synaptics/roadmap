// @module core/batch
// @exports advanceBatch, readyNodes, nextBatch, ReadyNode, NextBatch
// @types ReadyNode, NextBatch
// @entry roadmap

// Pure batch operations: advance, ready dispatch, lookahead. Zero IO imports.

import type { Graph, ConsumeSpec } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';
import type { CompletionStore } from '../lib/protocol/types.ts';
import { flat } from './graph.ts';
import { parallelOrder, batchConflicts } from './order.ts';
import { orient } from './orient.ts';
import type { Orientation } from './orient.ts';

// --- advanceBatch ---

export function advanceBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): Orientation {
  const exists = (id: string) => completion.hasPassing(id);
  const current = orient(g, exists, retired);

  if (!current.batchComplete) {
    throw new Error(
      `Cannot advance: batch not complete. Remaining nodes: ${current.batchRemaining.join(', ')}`
    );
  }

  return orient(g, exists, retired);
}

// --- readyNodes: eager dispatch beyond current batch ---

export interface ReadyNode {
  id: string;
  level: number;
  produces: readonly string[];
  consumes: string[];
  mode: 'execute' | 'plan';
}

export function readyNodes<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): ReadyNode[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));

  // Build expansion index for plan nodes
  const expansionChildren = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.expandedFrom) {
      const children = expansionChildren.get(n.expandedFrom) ?? [];
      children.push(n.id);
      expansionChildren.set(n.expandedFrom, children);
    }
  }

  // Compute done set — receipt-only, same as orient()
  const done = new Set<string>();
  for (const n of nodes) {
    if (retired?.has(n.id)) { done.add(n.id); continue; }
    if (n.mode === 'plan') {
      if (completion.hasPassing(n.id)) { done.add(n.id); continue; }
      if ((expansionChildren.get(n.id) ?? []).length > 0) done.add(n.id);
    } else if (completion.hasPassing(n.id)) {
      done.add(n.id);
    }
  }

  // Find current batch level (first incomplete)
  let currentLevel = -1;
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].some(id => !done.has(id))) {
      currentLevel = i;
      break;
    }
  }

  if (currentLevel === -1) return [];

  // Scan future batches for nodes whose deps are all in done set
  const ready: ReadyNode[] = [];
  for (let level = currentLevel + 1; level < batches.length; level++) {
    for (const id of batches[level]) {
      if (done.has(id)) continue;
      if (retired?.has(id)) continue;

      const node = nm.get(id)!;
      if (!node.deps.every(d => done.has(d as string))) continue;

      ready.push({
        id,
        level,
        produces: node.produces,
        consumes: node.consumes.map(c => consumeArtifact(c as ConsumeSpec)),
        mode: (node.mode ?? 'execute') as 'execute' | 'plan',
      });
    }
  }

  return ready;
}

// --- nextBatch: lookahead for orchestrator pre-warming ---

export interface NextBatch {
  nodes: string[];
  level: number;
  produces: string[];
  conflicts: string[];
}

export function nextBatch<T extends string>(
  g: Graph<T>,
  completion: CompletionStore,
  retired?: ReadonlySet<string>,
): NextBatch | null {
  const batches = parallelOrder(g);
  const current = orient(g, (id) => completion.hasPassing(id), retired);
  const nextLevel = current.level + 1;

  if (nextLevel >= batches.length) return null;

  const batch = batches[nextLevel];
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const produces = batch.flatMap(id => [...nm.get(id)!.produces]);

  const allConflicts = batchConflicts(g);
  const conflicts = allConflicts
    .filter(c => c.level === nextLevel)
    .map(c => c.file);

  return { nodes: batch, level: nextLevel, produces, conflicts };
}
