// @module orient-forward
// @exports scanPendingSpecs, PendingSpec
// @types PendingSpec

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

/**
 * PendingSpec — A spec file (.roadmap/*-spec.json) that hasn't been loaded into head.json yet.
 */
export interface PendingSpec {
  path: string;
  dagId: string;
  desc?: string;
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
  const roadmapDir = resolve(repoRoot, '.roadmap');
  const pending: PendingSpec[] = [];

  try {
    const files = readdirSync(roadmapDir);
    const specFiles = files.filter(f => f.endsWith('-spec.json') && f !== 'spec-origin.json');

    for (const file of specFiles) {
      const specPath = resolve(roadmapDir, file);
      try {
        const content = readFileSync(specPath, 'utf-8');
        const spec = JSON.parse(content);

        // Only consider valid spec format
        if (typeof spec === 'object' && spec !== null && 'dag_id' in spec) {
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
