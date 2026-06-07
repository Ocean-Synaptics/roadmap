// @module lib/ledger-migrate
// @exports migrateLedger

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadCompletionsWithEvidence,
  type CompletionRecordWithEvidence,
} from '../runtime/completion.ts';

export interface MigrateResult {
  migrated: number;
  jsonlPath: string;
  alreadyCurrent: boolean;
}

function compositeKey(record: CompletionRecordWithEvidence): string {
  return `${record.dagId ?? ''} ${record.nodeId}`;
}

/**
 * Idempotently migrate a legacy completed.json array into the append-only
 * completed.jsonl ledger. Folds the union of (jsonl ∪ legacy) by (dagId, nodeId)
 * — re-runs never duplicate lines. NEVER deletes completed.json (operator's act).
 */
export function migrateLedger(repoRoot: string): MigrateResult {
  const dir = join(repoRoot, '.roadmap');
  const jsonPath = join(dir, 'completed.json');
  const jsonlPath = join(dir, 'completed.jsonl');

  // No legacy array → nothing to migrate. No-op success.
  if (!existsSync(jsonPath)) {
    return { migrated: existsSync(jsonlPath) ? lineCount(jsonlPath) : 0, jsonlPath, alreadyCurrent: true };
  }

  // loadCompletionsWithEvidence folds (jsonl ∪ legacy) by composite key,
  // coercing/migrating legacy entries to the frozen evidence shape.
  const folded = loadCompletionsWithEvidence(repoRoot);

  // Re-key deterministically so output order is stable across runs.
  const records = [...folded.values()].sort((a, b) => compositeKey(a).localeCompare(compositeKey(b)));
  const body = records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const existing = existsSync(jsonlPath) ? readFileSync(jsonlPath, 'utf-8') : null;
  const alreadyCurrent = existing === body;
  if (!alreadyCurrent) writeFileSync(jsonlPath, body);

  return { migrated: records.length, jsonlPath, alreadyCurrent };
}

function lineCount(path: string): number {
  return readFileSync(path, 'utf-8').split('\n').filter(l => l.trim() !== '').length;
}
