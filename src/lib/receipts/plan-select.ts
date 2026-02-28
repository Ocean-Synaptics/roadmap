// @module plan-select
// @exports PlanSelectReceipt, writePlanSelectReceipt, loadPlanSelectReceipt, computeHeadSha, validatePlanSelection
// @types PlanSelectReceipt
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export interface PlanSelectReceipt {
  type: 'plan-select';
  headSha: string;
  candidateId: string;
  galleryHash?: string;
  selectedAt: string;
  selector: string;
  note?: string;
}

export function computeHeadSha(repoRoot: string): string {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) throw new Error('No .roadmap/head.json found');
  const bytes = readFileSync(headPath);
  return createHash('sha256').update(bytes).digest('hex');
}

export function writePlanSelectReceipt(
  repoRoot: string,
  candidateId: string,
  selector: string,
  opts?: { galleryHash?: string; note?: string },
): PlanSelectReceipt {
  const headSha = computeHeadSha(repoRoot);
  const receipt: PlanSelectReceipt = {
    type: 'plan-select',
    headSha,
    candidateId,
    selectedAt: new Date().toISOString(),
    selector,
    ...(opts?.galleryHash ? { galleryHash: opts.galleryHash } : {}),
    ...(opts?.note ? { note: opts.note } : {}),
  };

  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  // Write the receipt file
  const receiptHash = createHash('sha256')
    .update(receipt.headSha + receipt.candidateId + receipt.selectedAt)
    .digest('hex')
    .slice(0, 12);
  const receiptFile = `plan-select-${receiptHash}.json`;
  writeFileSync(join(receiptsDir, receiptFile), JSON.stringify(receipt, null, 2) + '\n');

  // Write PLAN_SELECTED.json pointer
  const pointer = {
    receipt: receiptFile,
    headSha: receipt.headSha,
    candidateId: receipt.candidateId,
  };
  writeFileSync(join(receiptsDir, 'PLAN_SELECTED.json'), JSON.stringify(pointer, null, 2) + '\n');

  return receipt;
}

export function loadPlanSelectReceipt(repoRoot: string): PlanSelectReceipt | null {
  const pointerPath = join(repoRoot, '.roadmap', 'receipts', 'PLAN_SELECTED.json');
  if (!existsSync(pointerPath)) return null;

  try {
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf-8'));
    const receiptPath = join(repoRoot, '.roadmap', 'receipts', pointer.receipt);
    if (!existsSync(receiptPath)) return null;
    return JSON.parse(readFileSync(receiptPath, 'utf-8'));
  } catch {
    return null;
  }
}

// Returns { valid, receipt?, mismatch? } — the single check for execution gates.
export function validatePlanSelection(repoRoot: string): {
  valid: boolean;
  receipt?: PlanSelectReceipt;
  reason?: string;
} {
  const receipt = loadPlanSelectReceipt(repoRoot);
  if (!receipt) return { valid: false, reason: 'No plan selected. Run `roadmap plan select <candidateId> --note "reason"`.' };

  const currentSha = computeHeadSha(repoRoot);
  if (receipt.headSha !== currentSha) {
    return {
      valid: false,
      receipt,
      reason: `Plan selection stale: receipt headSha ${receipt.headSha.slice(0, 8)}… ≠ current ${currentSha.slice(0, 8)}…. Re-run \`roadmap plan select <candidateId>\`.`,
    };
  }

  return { valid: true, receipt };
}
