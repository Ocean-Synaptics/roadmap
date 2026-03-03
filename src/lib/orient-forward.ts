// @module orient-forward
// @exports findPendingSpecs
// @types PendingSpec

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface PendingSpec {
  path: string;
  dagId: string;
  desc?: string;
}

/**
 * Scan for unloaded spec files in .roadmap directory.
 * Returns specs that have dag_id fields not matching currentDagId and not in head-index.json.
 */
export function findPendingSpecs(
  repoRoot: string,
  currentDagId: string
): PendingSpec[] {
  const roadmapDir = join(repoRoot, '.roadmap');

  // Load historical dag IDs from head-index.json if it exists
  const historicalDagIds = new Set<string>();
  const headIndexPath = join(roadmapDir, 'head-index.json');
  if (existsSync(headIndexPath)) {
    try {
      const indexData = JSON.parse(readFileSync(headIndexPath, 'utf-8'));
      if (indexData.id) {
        historicalDagIds.add(indexData.id);
      }
    } catch {
      // If head-index.json is malformed, skip it
    }
  }

  const pending: PendingSpec[] = [];

  // Glob for spec files: *-spec.json and *spec*.json
  let files: string[] = [];
  try {
    files = readdirSync(roadmapDir);
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }

  const specFiles = files.filter(
    (f) => f.endsWith('-spec.json') || f.includes('spec') && f.endsWith('.json')
  );

  for (const file of specFiles) {
    const filePath = join(roadmapDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const spec = JSON.parse(content);
      const dagId = spec.dag_id;

      if (!dagId) {
        // Skip specs without dag_id
        continue;
      }

      // Exclude if it matches current DAG or is in history
      if (dagId === currentDagId || historicalDagIds.has(dagId)) {
        continue;
      }

      pending.push({
        path: join('.roadmap', file),
        dagId,
        desc: spec.dag_desc,
      });
    } catch {
      // Skip malformed spec files
    }
  }

  return pending;
}
