// @module metaflow/audit/detectors
// @exports detectDisplayRegression, detectMissingTable, detectMissingDagRender, detectMissingProgressBar

import { readFileSync, existsSync } from 'node:fs';
import type { InteractionReceipt } from '../../types.ts';
import type { DetectorResult } from '../required-schema.ts';

const TABLE_CMDS = ['orient', 'chart', 'gantt', 'mine', 'verify'];
const DAG_CMDS = ['orient', 'chart'];
const BAR_CMDS = ['complete', 'chart'];

function readPlain(receipt: InteractionReceipt): string | null {
  if (!receipt.render.plainPath || !existsSync(receipt.render.plainPath)) return null;
  return readFileSync(receipt.render.plainPath, 'utf8');
}

export function detectMissingTable(receipts: InteractionReceipt[]): DetectorResult {
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  for (const r of receipts) {
    if (r.audience !== 'user') continue;
    if (!TABLE_CMDS.some(c => r.cmd.includes(c))) continue;
    const content = readPlain(r);
    if (content === null) {
      passed = false;
      evidence.push(`${r.stepId}: render file missing at ${r.render.plainPath}`);
      fix.push(`Re-run ${r.cmd} to regenerate render output`);
      continue;
    }
    if (!content.includes('|')) {
      passed = false;
      evidence.push(`${r.stepId}: no table (|) found in ${r.render.plainPath}`);
      fix.push(`Check render pipeline for ${r.cmd} — table formatting missing`);
    }
  }

  if (passed) evidence.push('all user-facing table commands contain table markup');
  return { code: 'RD-001', passed, evidence, fix };
}

export function detectMissingDagRender(receipts: InteractionReceipt[]): DetectorResult {
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;
  const dagMarkers = ['L0', 'L00', 'conflict', 'critical'];

  for (const r of receipts) {
    if (!DAG_CMDS.some(c => r.cmd.includes(c))) continue;
    const content = readPlain(r);
    if (content === null) {
      passed = false;
      evidence.push(`${r.stepId}: render file missing at ${r.render.plainPath}`);
      fix.push(`Re-run ${r.cmd} to regenerate render output`);
      continue;
    }
    if (!dagMarkers.some(m => content.includes(m))) {
      passed = false;
      evidence.push(`${r.stepId}: no DAG markers (L0/L00/conflict/critical) in ${r.render.plainPath}`);
      fix.push(`Check DAG render for ${r.cmd} — batch level markers missing`);
    }
  }

  if (passed) evidence.push('all orient/chart outputs contain DAG markers');
  return { code: 'RD-002', passed, evidence, fix };
}

export function detectMissingProgressBar(receipts: InteractionReceipt[]): DetectorResult {
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;
  const barChars = ['\u2588', '\u2591', '['];

  for (const r of receipts) {
    if (!BAR_CMDS.some(c => r.cmd.includes(c))) continue;
    const content = readPlain(r);
    if (content === null) {
      passed = false;
      evidence.push(`${r.stepId}: render file missing at ${r.render.plainPath}`);
      fix.push(`Re-run ${r.cmd} to regenerate render output`);
      continue;
    }
    if (!barChars.some(ch => content.includes(ch))) {
      passed = false;
      evidence.push(`${r.stepId}: no progress bar chars in ${r.render.plainPath}`);
      fix.push(`Check progress bar rendering for ${r.cmd}`);
    }
  }

  if (passed) evidence.push('all complete/chart outputs contain progress bar');
  return { code: 'RD-003', passed, evidence, fix };
}

export function detectDisplayRegression(
  receipts: InteractionReceipt[],
  _opts: { required?: string[] } = {},
): DetectorResult[] {
  return [
    detectMissingTable(receipts),
    detectMissingDagRender(receipts),
    detectMissingProgressBar(receipts),
  ];
}
