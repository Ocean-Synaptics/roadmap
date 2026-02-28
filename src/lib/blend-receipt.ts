// @module blend-receipt
// @exports BlendReceipt, writeBlendReceipt, readBlendLedger
// @types BlendReceipt, GuardResult, StatementOwnership, CheckSet, CheckEntry
// @entry roadmap

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface GuardResult {
  guardName: string;
  passed: boolean;
  evidence?: string;
}

export interface StatementOwnership {
  statement: string;
  ownerNodeId: string;
  provenance: string[]; // source → transform → output chain
}

export type CheckStatus = 'pass' | 'fail' | 'skip';

export interface CheckEntry {
  checkId: string;
  description: string;
  status: CheckStatus;
  rollbackEvidence?: string;
}

export interface CheckSet {
  checks: CheckEntry[];
  allPassed: boolean;
}

export interface BlendReceipt {
  blendId: string;
  timestamp: string;
  inputs: string[];         // candidate IDs
  outputId: string;         // blended result id
  guardResults: GuardResult[];
  statementOwnership: StatementOwnership[];
  checkSet: CheckSet;
}

const LEDGER_PATH = (repoRoot: string) => join(repoRoot, '.roadmap', 'blend-ledger.jsonl');

export function writeBlendReceipt(receipt: BlendReceipt, repoRoot: string): void {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(LEDGER_PATH(repoRoot), JSON.stringify(receipt) + '\n', 'utf-8');
}

export function readBlendLedger(repoRoot: string): BlendReceipt[] {
  const path = LEDGER_PATH(repoRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as BlendReceipt);
}
