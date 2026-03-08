// @module core/order
// @exports order, parallelOrder, criticalPath, batchConflicts, BatchConflict
// @types BatchConflict
// @entry roadmap

// Pure topological ordering and batch computation. Zero IO imports.

import type { Graph, ConsumeSpec } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';
import { flat, fwd } from './graph.ts';

// Default comparator: lexicographic by node id (FR-DET-001)
const lexCmp = (a: string, b: string) => a.localeCompare(b);

// --- order: topological sort ---

export function order<T extends string>(g: Graph<T>, cmp: (a: string, b: string) => number = lexCmp): string[] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id).sort(cmp);
  const out: string[] = [];
  while (q.length) {
    q.sort(cmp);
    const n = q.shift()!;
    out.push(n);
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  if (out.length < nodes.length) throw new Error('Cycle detected');
  return out;
}

// --- parallelOrder: batched topological sort ---

export function parallelOrder<T extends string>(g: Graph<T>, cmp: (a: string, b: string) => number = lexCmp): string[][] {
  const nodes = flat(g);
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const batches: string[][] = [];

  let ready = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  while (ready.length) {
    batches.push(ready.sort(cmp));
    const next: string[] = [];
    for (const n of ready) {
      for (const s of a.get(n) ?? []) {
        const d = deg.get(s)! - 1;
        deg.set(s, d);
        if (d === 0) next.push(s);
      }
    }
    ready = next;
  }

  const visited = batches.flat().length;
  if (visited < nodes.length) throw new Error('Cycle detected');
  return batches;
}

// --- batchConflicts: detect resource conflicts within parallel batches ---

export interface BatchConflict {
  level: number;
  file: string;
  writers: string[];
  type: 'produces-overlap' | 'consumes-produces-race';
}

export function batchConflicts<T extends string>(g: Graph<T>): BatchConflict[] {
  const batches = parallelOrder(g);
  const nodes = flat(g);
  const nm = new Map(nodes.map(n => [n.id, n]));
  const conflicts: BatchConflict[] = [];

  for (let level = 0; level < batches.length; level++) {
    const batch = batches[level];
    if (batch.length < 2) continue;

    // Produces overlap: two nodes write the same file
    const writers = new Map<string, string[]>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) {
        const w = writers.get(p) ?? [];
        w.push(id);
        writers.set(p, w);
      }
    }
    for (const [file, w] of writers) {
      if (w.length > 1) conflicts.push({ level, file, writers: w, type: 'produces-overlap' });
    }

    // Consumes-produces race: node A consumes what node B in same batch produces
    const producedInBatch = new Map<string, string>();
    for (const id of batch) {
      const produces = nm.get(id)!.produces ?? [];
      if (!Array.isArray(produces)) continue;
      for (const p of produces) producedInBatch.set(p, id);
    }
    for (const id of batch) {
      const consumes = nm.get(id)!.consumes ?? [];
      if (!Array.isArray(consumes)) continue;
      for (const c of consumes.map(consumeArtifact)) {
        const producer = producedInBatch.get(c);
        if (producer && producer !== id) {
          conflicts.push({ level, file: c, writers: [producer, id], type: 'consumes-produces-race' });
        }
      }
    }
  }

  return conflicts;
}

// --- criticalPath: longest path from init to term ---

export function criticalPath<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const adj = fwd(nodes);
  const order_ = order(g);

  const dist = new Map<string, number>();
  const pred = new Map<string, string | null>();

  for (const id of order_) {
    dist.set(id, 1);
    pred.set(id, null);
  }

  for (const id of order_) {
    const d = dist.get(id)!;
    for (const succ of adj.get(id) ?? []) {
      const candidate = d + 1;
      if (candidate > dist.get(succ)!) {
        dist.set(succ, candidate);
        pred.set(succ, id);
      }
    }
  }

  const path: string[] = [];
  let cur: string | null = g.term;
  while (cur !== null) {
    path.unshift(cur);
    cur = pred.get(cur) ?? null;
  }

  return path;
}
