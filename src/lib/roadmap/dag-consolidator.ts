// @module consolidation
// @exports discoverDAGFiles, loadDAGFiles, mergeMultiWay, ConsolidationError
// @types DAGFile, MergeResult, PhaseConnection

import * as fs from 'fs';
import * as path from 'path';
import { merge, define } from '../../protocol.ts';
import type { Graph } from '../../protocol.ts';
import { buildDAGDependencyGraph, groupDAGsIntoBatches } from './dag-dependency-resolver.ts';

export interface DAGFile {
  path: string;
  name: string; // e.g., "typescript-cleanup-001.json"
  content: Graph<string>;
}

export interface PhaseConnection {
  from: string; // source DAG id
  to: string;   // target DAG id
  reason: string; // why they connect (artifact overlap, explicit metadata)
}

export interface MergeResult {
  merged: Graph<string>;
  phases: { [dagId: string]: string[] }; // mapping of phase id to node ids
  connections: PhaseConnection[];
  sourceFiles: string[];
  timestamp: string;
  executionOrder: string[];  // topologically sorted DAG IDs
  executionBatches: string[][]; // DAGs that can run in parallel
}

export class ConsolidationError extends Error {
  code: string;
  context: Record<string, any>;

  constructor(
    code: string,
    message: string,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'ConsolidationError';
    this.code = code;
    this.context = context;
  }
}

/**
 * Discover all DAG files in .roadmap/ directory
 * Filters out: head.json, head-index.json, temporary files, non-DAG files
 */
export async function discoverDAGFiles(roadmapRoot: string): Promise<DAGFile[]> {
  const roadmapDir = path.join(roadmapRoot, '.roadmap');

  if (!fs.existsSync(roadmapDir)) {
    throw new ConsolidationError(
      'ROADMAP_DIR_NOT_FOUND',
      `Roadmap directory not found: ${roadmapDir}`
    );
  }

  const files = fs.readdirSync(roadmapDir);
  const dagFiles: DAGFile[] = [];

  // Deterministic order for reproducible merges
  const sortedFiles = files.filter((f) => f.endsWith('.json')).sort();

  for (const file of sortedFiles) {
    // Skip system files
    if (
      file === 'head.json' ||
      file === 'head-index.json' ||
      file === 'git-state.json' ||
      file === 'hook-config.json' ||
      file === 'iter.json' ||
      file === 'recovery-state.json' ||
      file === 'PLAN_SELECTED.json' ||
      file === 'strategy.json' ||
      file === 'rates.json' ||
      file === 'spec-origin.json' ||
      file === 'migration-receipt.json' ||
      file === 'retired.json' ||
      file === 'test-head.json' ||
      file.endsWith('.backup.json') ||
      file.startsWith('.')
    ) {
      continue;
    }

    const filePath = path.join(roadmapDir, file);

    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Validate it's a DAG (has required shape)
      if (
        content &&
        typeof content === 'object' &&
        'id' in content &&
        'desc' in content &&
        'init' in content &&
        'term' in content &&
        'nodes' in content &&
        typeof content.nodes === 'object'
      ) {
        dagFiles.push({
          path: filePath,
          name: file,
          content,
        });
      }
    } catch (err) {
      // Skip files that don't parse or aren't DAGs
      continue;
    }
  }

  if (dagFiles.length === 0) {
    throw new ConsolidationError(
      'NO_DAGS_FOUND',
      `No DAG files found in ${roadmapDir}`
    );
  }

  return dagFiles;
}

/**
 * Find connection points between two DAGs
 * Returns true if A.term should connect to B.init
 */
function findConnection(
  dagA: Graph<string>,
  dagB: Graph<string>
): { exists: boolean; reason: string } {
  // Get term and init nodes
  const termNodeA = dagA.nodes[dagA.term];
  const initNodeB = dagB.nodes[dagB.init];

  if (!termNodeA || !initNodeB) {
    return { exists: false, reason: 'missing term or init node' };
  }

  // Check for artifact overlap: A produces what B consumes
  const aProduces = new Set(termNodeA.produces || []);
  const bConsumes = new Set(initNodeB.consumes || []);

  const overlap = Array.from(aProduces).filter((p) => bConsumes.has(p));
  if (overlap.length > 0) {
    return {
      exists: true,
      reason: `artifact overlap: ${overlap.join(', ')}`,
    };
  }

  return { exists: false, reason: 'no artifact overlap' };
}

/**
 * Merge multiple DAGs into a single unified graph
 * Uses topological sort to resolve inter-DAG dependencies correctly
 * Enables interleaved execution (parallel nodes from different DAGs)
 */
export function mergeMultiWay(dagFiles: DAGFile[]): MergeResult {
  if (dagFiles.length === 0) {
    throw new ConsolidationError(
      'EMPTY_MERGE',
      'No DAGs provided to merge'
    );
  }

  // Single DAG case: no merge needed
  if (dagFiles.length === 1) {
    const dag = dagFiles[0];
    return {
      merged: dag.content,
      phases: { [dag.content.id]: Object.keys(dag.content.nodes) },
      connections: [],
      sourceFiles: [dag.name],
      timestamp: new Date().toISOString(),
      executionOrder: [dag.content.id],
      executionBatches: [[dag.content.id]],
    };
  }

  // Build dependency graph between DAGs
  const dags = dagFiles.map(f => f.content);
  const depGraph = buildDAGDependencyGraph(dags);

  if (depGraph.hasCycle) {
    throw new ConsolidationError(
      'CIRCULAR_DEPENDENCY',
      'Circular dependency detected between DAGs',
      { dagIds: dags.map(d => d.id) }
    );
  }

  // Get execution order and batches for parallel execution
  const executionOrder = depGraph.order;
  const executionBatches = groupDAGsIntoBatches(depGraph);

  // Create map for quick DAG lookup
  const dagMap = new Map<string, Graph<string>>();
  for (const dag of dags) {
    dagMap.set(dag.id, dag);
  }

  // Create map for DAG file names
  const fileMap = new Map<string, string>();
  for (const dagFile of dagFiles) {
    fileMap.set(dagFile.content.id, dagFile.name);
  }

  // Merge in correct topological order
  let currentMerged = dagMap.get(executionOrder[0])!;
  const connections: PhaseConnection[] = [];
  const phases: { [dagId: string]: string[] } = {};
  const sourceFiles = [fileMap.get(currentMerged.id)!];

  phases[currentMerged.id] = Object.keys(currentMerged.nodes);

  // Merge each subsequent DAG in topological order
  for (let i = 1; i < executionOrder.length; i++) {
    const nextDAGId = executionOrder[i];
    const nextDAG = dagMap.get(nextDAGId)!;

    sourceFiles.push(fileMap.get(nextDAGId)!);
    phases[nextDAG.id] = Object.keys(nextDAG.nodes);

    // Find ALL artifacts that flow from currentMerged to nextDAG
    const currentContract = depGraph.dags.get(currentMerged.id)!;
    const nextContract = depGraph.dags.get(nextDAG.id)!;

    // Find overlapping artifacts (currentMerged produces, nextDAG consumes)
    const overlappingArtifacts: string[] = [];
    for (const artifact of currentContract.produces) {
      if (nextContract.consumes.has(artifact)) {
        overlappingArtifacts.push(artifact);
      }
    }

    if (overlappingArtifacts.length > 0) {
      // Create connection for each overlapping artifact
      for (const artifact of overlappingArtifacts) {
        connections.push({
          from: currentMerged.id,
          to: nextDAG.id,
          reason: `artifact: ${artifact}`,
        });
      }

      // Create merge connection: find best node pair
      // Use terminal node of current → init node of next
      const termNode = currentMerged.nodes[currentMerged.term];
      const initNode = nextDAG.nodes[nextDAG.init];

      if (!termNode || !initNode) {
        throw new ConsolidationError(
          'MERGE_STRUCTURE_ERROR',
          `Missing term or init node in merge`,
          { current: currentMerged.id, next: nextDAG.id }
        );
      }

      // Use all overlapping artifacts as the connection
      const connSpecs: Array<{ g1Node: string; g2Node: string; artifact: string }> = [
        {
          g1Node: termNode.id,
          g2Node: initNode.id,
          artifact: overlappingArtifacts[0], // Primary artifact for edge
        },
      ];

      try {
        const merged = merge(currentMerged, nextDAG, connSpecs);
        currentMerged = merged;
      } catch (err) {
        throw new ConsolidationError(
          'MERGE_FAILED',
          `Failed to merge ${currentMerged.id} and ${nextDAG.id}: ${err}`,
          { sourceDAGs: [currentMerged.id, nextDAG.id], artifacts: overlappingArtifacts }
        );
      }
    } else {
      // No direct artifact overlap, but nextDAG may depend on currentMerged through transitive deps
      // Still merge, but without explicit edge (preserve modular structure)
      const connSpecs: Array<{ g1Node: string; g2Node: string; artifact: string }> = [
        {
          g1Node: currentMerged.term,
          g2Node: nextDAG.init,
          artifact: '', // No artifact connection
        },
      ];

      try {
        const merged = merge(currentMerged, nextDAG, connSpecs);
        currentMerged = merged;
      } catch (err) {
        throw new ConsolidationError(
          'MERGE_FAILED',
          `Failed to merge ${currentMerged.id} and ${nextDAG.id}: ${err}`,
          { sourceDAGs: [currentMerged.id, nextDAG.id] }
        );
      }
    }
  }

  // Validate merged graph
  try {
    define(currentMerged);
  } catch (err) {
    throw new ConsolidationError(
      'MERGED_GRAPH_INVALID',
      `Merged graph is invalid: ${err}`,
      { error: err }
    );
  }

  return {
    merged: currentMerged,
    phases,
    connections,
    sourceFiles,
    timestamp: new Date().toISOString(),
    executionOrder,
    executionBatches,
  };
}

/**
 * Load all DAG files from disk
 */
export async function loadDAGFiles(dagFiles: DAGFile[]): Promise<Graph<string>[]> {
  return dagFiles.map((f) => f.content);
}

/**
 * Integration: discover, load, and merge all DAGs
 */
export async function consolidateAllDAGs(roadmapRoot: string): Promise<MergeResult> {
  const dagFiles = await discoverDAGFiles(roadmapRoot);
  const result = mergeMultiWay(dagFiles);
  return result;
}

