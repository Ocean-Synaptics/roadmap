// @module dag-dependency-resolver
// @exports analyzeDAGContract, buildDAGDependencyGraph, getTransitiveDependencies, canRunInParallel, groupDAGsIntoBatches, resolvePredecessors, UnresolvedConsumesError
// @types DAGContract, DAGDependencyGraph, PredecessorMap
// @entry internal

// Ordering rule (post r-rewrite-dependency-resolver):
//   Every ordering edge is consumes-of-an-upstream-produces.
//   No `dep` field is read on NodeSpec. The predecessor graph is built by
//   matching every node's consumes paths against every other node's produces.
//   If a node consumes a path no node produces, we throw UnresolvedConsumesError.

import type { Graph, NodeSpec } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

export interface DAGContract {
  id: string;
  produces: Set<string>;          // all artifacts this DAG produces (across all nodes)
  consumes: Set<string>;          // all artifacts this DAG consumes
  externalConsumes: Map<string, Set<string>>; // node → artifacts it needs from other DAGs
}

export interface DAGDependencyGraph {
  dags: Map<string, DAGContract>;
  dependencies: Map<string, Set<string>>; // DAG A → [DAGs that A relies on]
  order: string[];                // topologically sorted DAG IDs
  hasCycle: boolean;
}

export interface PredecessorMap {
  // node id → set of predecessor node ids (derived from consumes ↔ produces)
  predecessors: Map<string, Set<string>>;
  // node id → set of artifact paths (one entry per consumes edge)
  edgesByArtifact: Map<string, Array<{ from: string; to: string }>>;
}

export class UnresolvedConsumesError extends Error {
  readonly nodeId: string;
  readonly path: string;
  constructor(nodeId: string, path: string, dagId?: string) {
    super(
      `Unresolvable consumes: node "${nodeId}"${dagId ? ` (dag "${dagId}")` : ''} consumes "${path}" but no node produces it`,
    );
    this.name = 'UnresolvedConsumesError';
    this.nodeId = nodeId;
    this.path = path;
  }
}

/**
 * Build the intra-DAG predecessor graph by matching every node's consumes
 * paths against every other node's produces. This is the ONLY source of
 * ordering — there is no `dep` field read here.
 *
 * Throws UnresolvedConsumesError if a consumes path cannot be traced to any
 * node's produces in the same DAG. (Pass `allowExternal: true` to suppress —
 * cross-DAG consumers handle that case in buildDAGDependencyGraph.)
 */
export function resolvePredecessors(
  dag: Graph<string>,
  opts: { allowExternal?: boolean } = {},
): PredecessorMap {
  const producers = new Map<string, string>(); // artifact → producing node id
  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    for (const p of node.produces ?? []) {
      // Last writer wins for the producer index — overlapping produces are a
      // separate concern (batchConflicts), not an ordering question.
      producers.set(p, nodeId);
    }
  }

  const predecessors = new Map<string, Set<string>>();
  const edgesByArtifact = new Map<string, Array<{ from: string; to: string }>>();

  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    predecessors.set(nodeId, new Set());
    for (const c of node.consumes ?? []) {
      const path = consumeArtifact(c);
      const from = producers.get(path);
      if (!from) {
        if (opts.allowExternal) continue;
        throw new UnresolvedConsumesError(nodeId, path, dag.id);
      }
      if (from === nodeId) continue; // self-consume is a no-op edge
      predecessors.get(nodeId)!.add(from);
      const list = edgesByArtifact.get(path) ?? [];
      list.push({ from, to: nodeId });
      edgesByArtifact.set(path, list);
    }
  }

  return { predecessors, edgesByArtifact };
}

/**
 * Analyze a single DAG's contract:
 * - What does it produce (across all nodes)?
 * - What does it consume?
 * - Which nodes need external (cross-DAG) artifacts?
 */
export function analyzeDAGContract(dag: Graph<string>): DAGContract {
  const produces = new Set<string>();
  const consumes = new Set<string>();
  const externalConsumes = new Map<string, Set<string>>();

  for (const node of Object.values(dag.nodes)) {
    for (const p of node.produces ?? []) produces.add(p);
    for (const c of node.consumes ?? []) consumes.add(consumeArtifact(c));
  }

  for (const [nodeId, node] of Object.entries(dag.nodes)) {
    const external = (node.consumes ?? [])
      .map(c => consumeArtifact(c))
      .filter(artifact => !produces.has(artifact));
    if (external.length > 0) externalConsumes.set(nodeId, new Set(external));
  }

  return { id: dag.id, produces, consumes, externalConsumes };
}

/**
 * Build dependency graph between DAGs from consumes ↔ produces.
 * DAG A relies on DAG B iff some node in A consumes an artifact produced by B
 * (and not by any node in A).
 */
export function buildDAGDependencyGraph(dags: Graph<string>[]): DAGDependencyGraph {
  const contracts = new Map<string, DAGContract>();
  const dependencies = new Map<string, Set<string>>();

  for (const dag of dags) {
    contracts.set(dag.id, analyzeDAGContract(dag));
    dependencies.set(dag.id, new Set());
  }

  for (const [dagId, contract] of contracts.entries()) {
    for (const externalArtifacts of contract.externalConsumes.values()) {
      for (const artifact of externalArtifacts) {
        for (const [otherId, otherContract] of contracts.entries()) {
          if (otherId !== dagId && otherContract.produces.has(artifact)) {
            dependencies.get(dagId)!.add(otherId);
          }
        }
      }
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const order: string[] = [];
  let hasCycle = false;

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    if (recursionStack.has(nodeId)) {
      hasCycle = true;
      return;
    }
    recursionStack.add(nodeId);
    for (const depId of dependencies.get(nodeId) ?? []) dfs(depId);
    recursionStack.delete(nodeId);
    visited.add(nodeId);
    order.push(nodeId);
  }
  for (const dagId of contracts.keys()) dfs(dagId);

  return { dags: contracts, dependencies, order, hasCycle };
}

export function getTransitiveDependencies(
  dagId: string,
  depGraph: DAGDependencyGraph,
): Set<string> {
  const visited = new Set<string>();
  const stack = [dagId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const deps = depGraph.dependencies.get(current);
    if (deps) for (const dep of deps) if (!visited.has(dep)) stack.push(dep);
  }
  visited.delete(dagId);
  return visited;
}

export function canRunInParallel(
  dagA: string,
  dagB: string,
  depGraph: DAGDependencyGraph,
): boolean {
  const depsA = depGraph.dependencies.get(dagA) ?? new Set();
  const depsB = depGraph.dependencies.get(dagB) ?? new Set();
  return !depsA.has(dagB) && !depsB.has(dagA);
}

export function groupDAGsIntoBatches(depGraph: DAGDependencyGraph): string[][] {
  const batches: string[][] = [];
  const processed = new Set<string>();

  for (const dagId of depGraph.order) {
    if (processed.has(dagId)) continue;
    const batch = [dagId];
    processed.add(dagId);
    for (const otherDagId of depGraph.order) {
      if (processed.has(otherDagId)) continue;
      const canParallelize = batch.every(b => canRunInParallel(otherDagId, b, depGraph));
      if (canParallelize) {
        batch.push(otherDagId);
        processed.add(otherDagId);
      }
    }
    batches.push(batch);
  }

  return batches;
}
