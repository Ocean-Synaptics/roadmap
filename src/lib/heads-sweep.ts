// @module lib/heads-sweep
// @exports sweepHeads

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CompletionStore } from '../runtime/completion.ts';

interface HeadDAG {
  id?: string;
  nodes?: Record<string, unknown>;
  _lineage?: { completedAt?: string };
}

export interface SweepResult {
  swept: string[];
  skipped: string[];
}

/**
 * Stamp `_lineage.completedAt` onto every heads/*.json DAG whose every node has
 * a passing receipt. Idempotent: already-stamped heads are skipped (no restamp).
 * Incomplete heads are never stamped. Returns dagIds newly stamped (swept) vs
 * skipped (incomplete or already-stamped).
 */
export function sweepHeads(repoRoot: string): SweepResult {
  const headsDir = join(repoRoot, '.roadmap', 'heads');
  if (!existsSync(headsDir)) return { swept: [], skipped: [] };

  const files = readdirSync(headsDir).filter(f => f.endsWith('.json'));
  const store = CompletionStore.loadOrEmpty(repoRoot);

  const swept: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const path = join(headsDir, file);
    let parsed: HeadDAG;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf-8')) as HeadDAG;
    } catch {
      continue; // malformed head — skip
    }

    const dagId = parsed.id ?? file.replace('.json', '');

    if (parsed._lineage?.completedAt) {
      skipped.push(dagId);
      continue; // already stamped — idempotent
    }

    const nodeIds = Object.keys(parsed.nodes ?? {});
    const dagStore = store.filterByDagId(dagId);
    const complete = nodeIds.length > 0 && nodeIds.every(id => dagStore.hasPassing(id));
    if (!complete) {
      skipped.push(dagId);
      continue; // any node lacking a passing receipt — never stamp
    }

    parsed._lineage = { ...parsed._lineage, completedAt: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(parsed, null, 2));
    swept.push(dagId);
  }

  return { swept, skipped };
}
