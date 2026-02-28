// @module plan-selected-pointer
// @exports PlanSelectedPointer, readPointer, writePointer, pointerValid
// @types PlanSelectedPointer
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeHeadSha } from './plan-select.ts';

export interface PlanSelectedPointer {
  receipt: string;       // filename of the plan-select receipt
  headSha: string;       // sha256 of head.json at selection time
  candidateId: string;   // which candidate was selected
}

const POINTER_FILE = 'PLAN_SELECTED.json';

function pointerPath(repoRoot: string): string {
  return join(repoRoot, '.roadmap', 'receipts', POINTER_FILE);
}

export function readPointer(repoRoot: string): PlanSelectedPointer | null {
  const path = pointerPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    if (
      typeof raw.receipt !== 'string' ||
      typeof raw.headSha !== 'string' ||
      typeof raw.candidateId !== 'string'
    ) return null;
    return raw as PlanSelectedPointer;
  } catch {
    return null;
  }
}

export function writePointer(repoRoot: string, pointer: PlanSelectedPointer): void {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(pointerPath(repoRoot), JSON.stringify(pointer, null, 2) + '\n');
}

export function pointerValid(
  repoRoot: string,
): { valid: boolean; pointer?: PlanSelectedPointer; reason?: string } {
  const pointer = readPointer(repoRoot);
  if (!pointer) return { valid: false, reason: 'PLAN_SELECTED.json missing' };

  let currentSha: string;
  try {
    currentSha = computeHeadSha(repoRoot);
  } catch (err) {
    return { valid: false, pointer, reason: String(err) };
  }

  if (pointer.headSha !== currentSha) {
    return {
      valid: false,
      pointer,
      reason: `headSha mismatch: pointer ${pointer.headSha.slice(0, 8)}… ≠ current ${currentSha.slice(0, 8)}…`,
    };
  }

  return { valid: true, pointer };
}
