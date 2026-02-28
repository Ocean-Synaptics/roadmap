// @module completion-evidence
// @description Receipt-based completion evidence — extends CompletionRecord with validator proof
// @exports EvidenceRecord, CompletionRecordWithEvidence, hasPassingReceipt, saveCompletionWithEvidence, loadCompletionsWithEvidence

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface EvidenceRecord {
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface CompletionRecordWithEvidence {
  nodeId: string;
  completedAt: string;
  owner?: string;
  checkpointId?: string;
  legacy?: boolean;
  validationChecks?: EvidenceRecord[];
}

// Receipt is passing when: checks exist, all passed, not legacy-without-checks
export function hasPassingReceipt(record: CompletionRecordWithEvidence | undefined): boolean {
  if (!record) return false;
  if (!record.validationChecks || record.validationChecks.length === 0) return false;
  return record.validationChecks.every(c => c.passed);
}

export function loadCompletionsWithEvidence(repoRoot: string): Map<string, CompletionRecordWithEvidence> {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');
  if (!existsSync(completionPath)) return new Map();

  try {
    const data = JSON.parse(readFileSync(completionPath, 'utf-8'));
    const records = new Map<string, CompletionRecordWithEvidence>();
    if (Array.isArray(data)) {
      for (const record of data) records.set(record.nodeId, record);
    }
    return records;
  } catch {
    return new Map();
  }
}

export function saveCompletionWithEvidence(
  repoRoot: string,
  nodeId: string,
  checks: EvidenceRecord[],
  owner?: string,
  checkpointId?: string,
): void {
  const dirPath = join(repoRoot, '.roadmap');
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

  const completions = loadCompletionsWithEvidence(repoRoot);
  completions.set(nodeId, {
    nodeId,
    completedAt: new Date().toISOString(),
    owner,
    checkpointId,
    validationChecks: checks,
  });

  const recordArray = Array.from(completions.values());
  writeFileSync(join(dirPath, 'completed.json'), JSON.stringify(recordArray, null, 2) + '\n');
}
