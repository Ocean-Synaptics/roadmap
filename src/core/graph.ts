// @module core/graph
// @exports define, verify, check, flat, fwd, detectCycles, reach, Flat
// @types Flat
// @entry roadmap

// Pure graph validation algebra. Zero IO imports.
// define: structural validation (cycles, init/term)
// verify: contract validation (consumes satisfied by predecessors)
// check: termination (every node reachable init<->term)

import type { Graph, ConsumeSpec } from '../lib/protocol/types.ts';
import { consumeArtifact, consumeResolvedBy } from '../lib/protocol/types.ts';

// --- Internal: flat iteration over mapped type ---

export type Flat = {
  id: string;
  produces: readonly string[];
  consumes: readonly string[];
  deps: readonly string[];
  mode?: 'execute' | 'plan';
  expandedFrom?: string;
  loopTarget?: string;
  convergenceCheck?: {
    maxCoverageDelta?: number;
    requireEmptyProposals?: boolean;
    minWallClockDeltaMs?: number;
  };
  ambient?: readonly string[];
  track?: number;
  affects?: readonly string[];
};

export function flat<T extends string>(g: Graph<T>): Flat[] {
  return Object.values(g.nodes) as Flat[];
}

export function fwd(nodes: Flat[]): Map<string, string[]> {
  const m = new Map(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) for (const d of n.deps) m.get(d)?.push(n.id);
  return m;
}

// --- Cycle detection (Kahn's). Returns nodes in cycle, empty if acyclic. ---

export function detectCycles(nodes: Flat[]): string[] {
  const valid = new Set(nodes.map(n => n.id));
  const a = fwd(nodes);
  const deg = new Map(nodes.map(n => [n.id, n.deps.filter(d => valid.has(d)).length]));
  const q = [...deg].filter(([, d]) => d === 0).map(([id]) => id);
  let v = 0;
  while (q.length) {
    const n = q.shift()!;
    v++;
    for (const s of a.get(n) ?? []) {
      const d = deg.get(s)! - 1;
      deg.set(s, d);
      if (d === 0) q.push(s);
    }
  }
  return v < nodes.length ? [...deg].filter(([, d]) => d > 0).map(([id]) => id) : [];
}

// --- BFS reachability ---

export function reach(nodes: Flat[], from: string, to: string): boolean {
  if (from === to) return true;
  const a = fwd(nodes);
  const seen = new Set<string>();
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const s of a.get(n) ?? []) {
      if (s === to) return true;
      q.push(s);
    }
  }
  return false;
}

// --- define: validate structure ---

const CONVERGENCE_CHECK_KEYS = new Set(['maxCoverageDelta', 'requireEmptyProposals', 'minWallClockDeltaMs']);

export function define<T extends string>(g: Graph<T>): Graph<T> {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));

  if (!ids.has(g.init)) throw new Error(`init "${g.init}" not in nodes`);
  if (!ids.has(g.term)) throw new Error(`term "${g.term}" not in nodes`);
  if (g.init === g.term) throw new Error(`init and term cannot be the same node`);

  const c = detectCycles(nodes);
  if (c.length) throw new Error(`Cycle in "${g.id}": ${c.join(', ')}`);

  // Validate convergenceCheck keys
  for (const n of nodes) {
    if (!n.convergenceCheck) continue;
    const unknown = Object.keys(n.convergenceCheck).filter(k => !CONVERGENCE_CHECK_KEYS.has(k));
    if (unknown.length) throw new Error(`Node "${n.id}" convergenceCheck has unknown keys: ${unknown.join(', ')} — valid keys: ${[...CONVERGENCE_CHECK_KEYS].join(', ')}`);
  }

  // Validate track/affects
  for (const n of nodes) {
    const spec = n as unknown as { track?: unknown; affects?: unknown };
    if (spec.track !== undefined) {
      if (typeof spec.track !== 'number' || !Number.isInteger(spec.track) || spec.track < 0) {
        throw new Error(`Node "${n.id}" track must be a non-negative integer, got: ${spec.track}`);
      }
    }
    if (spec.affects !== undefined) {
      if (!Array.isArray(spec.affects)) {
        throw new Error(`Node "${n.id}" affects must be an array`);
      }
      for (const a of spec.affects) {
        if (typeof a !== 'string' || a.length === 0) {
          throw new Error(`Node "${n.id}" affects entries must be non-empty strings`);
        }
      }
    }
  }

  return g;
}

// --- verify: validate contracts ---

export function verify<T extends string>(g: Graph<T>): string[] {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const nm = new Map(nodes.map(n => [n.id, n]));
  const errors: string[] = [];

  for (const node of nodes) {
    if (!node.consumes.length) continue;
    const preds = new Set<string>();
    const q = [...node.deps.filter(d => ids.has(d))];
    while (q.length) {
      const p = q.shift()!;
      if (preds.has(p)) continue;
      preds.add(p);
      for (const d of nm.get(p)?.deps ?? []) if (ids.has(d)) q.push(d);
    }
    const available = new Set([...preds].flatMap(p => nm.get(p)?.produces ?? []));
    for (const c of node.consumes) {
      const artifact = consumeArtifact(c);
      const resolver = consumeResolvedBy(c);
      if (available.has(artifact)) continue;
      if (resolver && ids.has(resolver)) continue;
      errors.push(`"${node.id}" consumes "${artifact}" — no predecessor produces it`);
    }
  }

  return errors;
}

// --- check: termination ---

export function check<T extends string>(g: Graph<T>): { done: boolean; orphans: string[] } {
  const nodes = flat(g);
  const ids = new Set(nodes.map(n => n.id));
  const orphans: string[] = [];

  if (!reach(nodes, g.init, g.term)) orphans.push(`${g.term}: unreachable from ${g.init}`);

  for (const n of nodes) {
    if (n.id === g.init || n.id === g.term) continue;
    if (!reach(nodes, g.init, n.id)) orphans.push(`${n.id}: unreachable from ${g.init}`);
    else if (!reach(nodes, n.id, g.term)) orphans.push(`${n.id}: cannot reach ${g.term}`);

    if (n.loopTarget && !ids.has(n.loopTarget)) {
      orphans.push(`${n.id}: loopTarget "${n.loopTarget}" does not exist in this graph`);
    }
  }
  const termNode = nodes.find(n => n.id === g.term);
  if (termNode?.loopTarget && !ids.has(termNode.loopTarget)) {
    orphans.push(`${g.term}: loopTarget "${termNode.loopTarget}" does not exist in this graph`);
  }
  return { done: orphans.length === 0, orphans };
}
