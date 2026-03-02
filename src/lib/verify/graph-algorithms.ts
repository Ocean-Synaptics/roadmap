// @module verify/graph-algorithms
// @exports bfsReachability, contractClosure
// @types ReachabilityResult, ContractViolation
// @entry roadmap

import { consumeArtifact, consumeResolvedBy } from '../../protocol.ts';
import type { Graph } from '../../protocol.ts';

// --- FR-REACH-001: BFS reachability with witness ---

export interface ReachabilityResult {
  /** All nodes reachable from init, with BFS path evidence */
  reachable: Map<string, string[]>;  // nodeId → path from init
  /** Nodes not reachable from init */
  unreachable: string[];
  /** Nodes reachable from init but that cannot reach term */
  deadEnds: string[];
}

/**
 * Single-pass BFS reachability from init.
 * Returns witness paths for all reachable nodes and identifies unreachable + dead-end nodes.
 * Replaces multi-pass DFS (FR-REACH-001).
 */
export function bfsReachability<T extends string>(g: Graph<T>): ReachabilityResult {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  const allIds = new Set(nodes.map(n => n.id));

  // Build forward adjacency: dep → successors
  const fwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      fwd.get(d)?.push(n.id);
    }
  }

  // BFS from init — O(V+E) single pass
  const reachable = new Map<string, string[]>();
  const q: Array<{ id: string; path: string[] }> = [{ id: g.init, path: [g.init] }];
  while (q.length) {
    const { id, path } = q.shift()!;
    if (reachable.has(id)) continue;
    reachable.set(id, path);
    for (const s of fwd.get(id) ?? []) {
      if (!reachable.has(s)) q.push({ id: s, path: [...path, s] });
    }
  }

  const unreachable = nodes.map(n => n.id).filter(id => !reachable.has(id));

  // Reverse BFS from term to find dead-ends (reachable from init but cannot reach term)
  const bwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      bwd.get(n.id)?.push(d);
      // reverse: d ← n means n can be reached from d, so d → n in fwd; bwd[n] → [d]
    }
  }
  // Actually reverse: from each node, go to its dependents (predecessors in dependency sense)
  // We need: which nodes can reach term? Do reverse BFS from term using fwd edges in reverse
  const canReachTerm = new Set<string>();
  const rq: string[] = [g.term];
  const revAdj = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      const succs = revAdj.get(d) ?? [];
      succs.push(n.id);
      revAdj.set(d, succs);
    }
  }
  // revAdj[node] = nodes that depend on it (successors in topological order)
  // For "can reach term": reverse the graph (term ← successors)
  const termRevAdj = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      const arr = termRevAdj.get(n.id) ?? [];
      arr.push(d);
      termRevAdj.set(n.id, arr);
    }
  }
  // BFS from term using deps as reverse edges: if n has dep d, then d → n in fwd, so in rev: n → d? No.
  // Forward: d must complete before n. Edge d→n. Reverse: n→d.
  // "can reach term" using forward edges: start from node, follow fwd edges, can we reach term?
  // Equivalently: reverse graph has edge n→d for each dep d of n. BFS from term in reverse graph.
  const revFwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) {
      // forward edge: d → n. Reverse: n → d.
      const arr = revFwd.get(n.id) ?? [];
      arr.push(d);
      revFwd.set(n.id, arr);
    }
  }
  const canReachQ: string[] = [g.term];
  while (canReachQ.length) {
    const id = canReachQ.shift()!;
    if (canReachTerm.has(id)) continue;
    canReachTerm.add(id);
    for (const pred of revFwd.get(id) ?? []) {
      if (!canReachTerm.has(pred)) canReachQ.push(pred);
    }
  }

  const deadEnds = [...reachable.keys()].filter(id => !canReachTerm.has(id) && id !== g.term);

  return { reachable, unreachable, deadEnds };
}

// --- FR-CONTRACT-001: DP ancestor closure with witness ---

export interface ContractViolation {
  nodeId: string;
  missingArtifact: string;
  /** Which ancestor should have produced this artifact, if determinable */
  expectedProducer?: string;
  /** BFS path from init to nodeId showing the dependency chain */
  witnessPath: string[];
}

/**
 * Bottom-up DP ancestor closure: compute full ancestor set for each node,
 * then check each consumes entry against the closure's produces.
 * Emits ContractViolation with witness path for each missing artifact.
 * Replaces ad-hoc predecessor walk (FR-CONTRACT-001).
 */
export function contractClosure<T extends string>(g: Graph<T>): ContractViolation[] {
  const nodes = Object.values(g.nodes) as Array<{
    id: string;
    deps: readonly string[];
    produces: readonly string[];
    consumes: readonly string[];
  }>;
  const nm = new Map(nodes.map(n => [n.id, n]));
  const allIds = new Set(nodes.map(n => n.id));

  // BFS paths from init for witness
  const fwd = new Map<string, string[]>(nodes.map(n => [n.id, [] as string[]]));
  for (const n of nodes) {
    for (const d of n.deps) fwd.get(d)?.push(n.id);
  }
  const paths = new Map<string, string[]>();
  const bfsQ: Array<{ id: string; path: string[] }> = [{ id: g.init, path: [g.init] }];
  while (bfsQ.length) {
    const { id, path } = bfsQ.shift()!;
    if (paths.has(id)) continue;
    paths.set(id, path);
    for (const s of fwd.get(id) ?? []) {
      if (!paths.has(s)) bfsQ.push({ id: s, path: [...path, s] });
    }
  }

  // Bottom-up DP: topological order, compute ancestor set per node
  // ancestor closure = all nodes reachable from init that are predecessors of this node
  const ancestorSet = new Map<string, Set<string>>();
  // Topological sort via Kahn's
  const inDeg = new Map(nodes.map(n => [n.id, n.deps.filter(d => allIds.has(d)).length]));
  const topoQ = [...inDeg].filter(([, d]) => d === 0).map(([id]) => id);
  const topo: string[] = [];
  const inDegCopy = new Map(inDeg);
  while (topoQ.length) {
    const id = topoQ.shift()!;
    topo.push(id);
    for (const s of fwd.get(id) ?? []) {
      const d = inDegCopy.get(s)! - 1;
      inDegCopy.set(s, d);
      if (d === 0) topoQ.push(s);
    }
  }
  // Process in topo order: each node inherits ancestors of its deps
  for (const id of topo) {
    const node = nm.get(id)!;
    const ancestors = new Set<string>();
    for (const dep of node.deps.filter(d => allIds.has(d))) {
      ancestors.add(dep);
      for (const a of ancestorSet.get(dep) ?? []) ancestors.add(a);
    }
    ancestorSet.set(id, ancestors);
  }

  // Check contracts using closure
  const violations: ContractViolation[] = [];
  for (const node of nodes) {
    if (!node.consumes.length) continue;
    const ancestors = ancestorSet.get(node.id) ?? new Set();
    // All artifacts available from ancestors
    const available = new Map<string, string>(); // artifact → producing nodeId
    for (const anc of ancestors) {
      const ancNode = nm.get(anc)!;
      for (const p of ancNode.produces) {
        if (!available.has(p)) available.set(p, anc);
      }
    }

    for (const c of node.consumes) {
      const artifact = consumeArtifact(c);
      const resolver = consumeResolvedBy(c);
      if (available.has(artifact)) continue;
      if (resolver && allIds.has(resolver)) continue; // acknowledged pending
      violations.push({
        nodeId: node.id,
        missingArtifact: artifact,
        expectedProducer: available.get(artifact), // undefined if no ancestor produces it
        witnessPath: paths.get(node.id) ?? [node.id],
      });
    }
  }

  return violations;
}
