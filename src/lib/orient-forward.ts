// @module orient-forward
// @exports scanPendingSpecs, PendingSpec, scanSiblingDags, SiblingDag
// @types PendingSpec, SiblingDag

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

/**
 * PendingSpec — A spec file (.roadmap/*-spec.json) that hasn't been loaded into head.json yet.
 */
export interface PendingSpec {
  path: string;
  dagId: string;
  desc?: string;
}

/**
 * SiblingDag — A head.*.json DAG file (parallel DAG in the same repo).
 */
export interface SiblingDag {
  path: string;
  dagId: string;
  nodeCount: number;
}

/**
 * Scan .roadmap directory for unloaded specs.
 *
 * Compares DAG IDs in spec files with the current head.json dag_id.
 * Returns array of specs not yet loaded.
 *
 * @param repoRoot — repository root (contains .roadmap/)
 * @param currentHeadDagId — current DAG ID from head.json
 * @returns Array of pending specs
 */
export function scanPendingSpecs(
  repoRoot: string,
  currentHeadDagId: string,
): PendingSpec[] {
  const roadmapDir = resolve(repoRoot, ".roadmap");
  const pending: PendingSpec[] = [];

  try {
    const files = readdirSync(roadmapDir);
    const specFiles = files.filter(
      (f) => f.endsWith("-spec.json") && f !== "spec-origin.json",
    );

    for (const file of specFiles) {
      const specPath = resolve(roadmapDir, file);
      try {
        const content = readFileSync(specPath, "utf-8");
        const spec = JSON.parse(content);

        // Only consider valid spec format
        if (typeof spec === "object" && spec !== null && "dag_id" in spec) {
          const dagId = spec.dag_id;

          // Only include if not already in head.json
          if (dagId !== currentHeadDagId) {
            pending.push({
              path: `.roadmap/${file}`,
              dagId,
              desc: spec.dag_desc || undefined,
            });
          }
        }
      } catch (e) {
        // Skip specs that can't be parsed
      }
    }
  } catch (e) {
    // If .roadmap dir doesn't exist or can't be read, return empty
  }

  return pending;
}

/**
 * Scan .roadmap directory for sibling DAGs (head.*.json files).
 *
 * Returns all head.*.json files except the current DAG.
 * Useful for discovering parallel work when a sub-DAG completes.
 *
 * @param repoRoot — repository root (contains .roadmap/)
 * @param currentDagId — current DAG ID to exclude from results
 * @returns Array of sibling DAGs with metadata
 */
export function scanSiblingDags(
  repoRoot: string,
  currentDagId: string,
): SiblingDag[] {
  const roadmapDir = resolve(repoRoot, ".roadmap");
  const siblings: SiblingDag[] = [];

  try {
    const files = readdirSync(roadmapDir);
    const headFiles = files.filter(
      (f) =>
        (f.startsWith("head") && f.endsWith(".json") && f !== "head.json") ||
        (f.startsWith("head.") && f.endsWith(".json")),
    );

    for (const file of headFiles) {
      const dagPath = resolve(roadmapDir, file);
      try {
        const content = readFileSync(dagPath, "utf-8");
        const dag = JSON.parse(content);

        // Validate it's a Graph shape: has id and nodes
        if (
          typeof dag === "object" &&
          dag !== null &&
          typeof dag.id === "string" &&
          typeof dag.nodes === "object"
        ) {
          const dagId = dag.id;

          // Exclude the current DAG
          if (dagId !== currentDagId) {
            const nodeCount = Object.keys(dag.nodes).length;
            siblings.push({
              path: `.roadmap/${file}`,
              dagId,
              nodeCount,
            });
          }
        }
      } catch (e) {
        // Skip DAGs that can't be parsed
      }
    }
  } catch (e) {
    // If .roadmap dir doesn't exist or can't be read, return empty
  }

  return siblings;
}
