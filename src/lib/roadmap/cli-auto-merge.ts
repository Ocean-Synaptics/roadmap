// @module consolidation
// @exports loadDAGWithAutoMerge, shouldAutoMerge, MergeStrategy
// @types MergeStrategy, AutoMergeResult

import * as fs from 'fs';
import * as path from 'path';
import type { Graph } from '../../protocol.ts';
import { discoverDAGFiles, mergeMultiWay } from './dag-consolidator.ts';
import type { MergeResult } from './dag-consolidator.ts';

export interface AutoMergeResult {
  graph: Graph<string>;
  isMerged: boolean;
  sourceDAGs?: string[];
  mergeResult?: MergeResult;
}

/**
 * Load DAG with automatic merge.
 * If multiple DAGs exist, transparently merge them.
 * This is the primary entry point for CLI commands (orient, chart, show, complete).
 */
export async function loadDAGWithAutoMerge(
  roadmapRoot: string,
): Promise<AutoMergeResult> {
  const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');

  try {
    // Check if head.json exists and is fresh
    if (fs.existsSync(headPath)) {
      const shouldMerge = await shouldAutoMerge(roadmapRoot);

      if (!shouldMerge) {
        // head.json is fresh, use it
        const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
        return {
          graph,
          isMerged: false,
        };
      }
    }

    // Discover all DAG files
    const dagFiles = await discoverDAGFiles(roadmapRoot);

    // If only one file, use it
    if (dagFiles.length === 1) {
      const graph = dagFiles[0].content;
      fs.writeFileSync(headPath, JSON.stringify(graph, null, 2));
      return {
        graph,
        isMerged: false,
      };
    }

    // Multiple DAGs: perform merge
    const mergeResult = mergeMultiWay(dagFiles);

    // Update head.json with merged result
    fs.writeFileSync(
      headPath,
      JSON.stringify(mergeResult.merged, null, 2)
    );

    return {
      graph: mergeResult.merged,
      isMerged: true,
      sourceDAGs: mergeResult.sourceFiles,
      mergeResult,
    };
  } catch (err: any) {
    // Fallback: attempt to load existing head.json
    if (fs.existsSync(headPath)) {
      const graph = JSON.parse(fs.readFileSync(headPath, 'utf-8')) as Graph<string>;
      return {
        graph,
        isMerged: false,
      };
    }
    throw err;
  }
}

/**
 * Determine if auto-merge should run.
 * Conditions:
 * 1. Multiple DAG files exist in .roadmap/
 * 2. head.json is missing or older than source DAGs
 */
export async function shouldAutoMerge(roadmapRoot: string): Promise<boolean> {
  try {
    const dagFiles = await discoverDAGFiles(roadmapRoot);
    if (dagFiles.length <= 1) return false;

    const headPath = path.join(roadmapRoot, '.roadmap', 'head.json');

    // If head.json doesn't exist, definitely merge
    if (!fs.existsSync(headPath)) return true;

    // Check if any source DAG is newer than head.json
    const headStats = fs.statSync(headPath);
    for (const dagFile of dagFiles) {
      const sourceStats = fs.statSync(dagFile.path);
      if (sourceStats.mtime > headStats.mtime) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
