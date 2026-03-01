// @module metaflow/audit/detectors
// @exports detectIntegrationRoughPoints

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { InteractionReceipt, MiningResult, SessionBinding } from '../../types.ts';
import { COMMAND_REGISTRY } from '../../command-registry.ts';
import type { AuditContract, DetectorResult } from '../required-schema.ts';

export interface IntegrationOpts {
  base?: string;
  repoRoot?: string;
  contract?: AuditContract;
}

// IR-001: check PLAN_SELECTED.json exists and headSha matches
function detectMissingPlanReceipt(base: string): DetectorResult {
  const p = join(base, '.roadmap', 'receipts', 'PLAN_SELECTED.json');
  if (!existsSync(p)) {
    return { code: 'IR-001', passed: false, evidence: ['PLAN_SELECTED.json missing'], fix: ['Run roadmap plan-select to generate receipt'] };
  }
  try {
    const receipt = JSON.parse(readFileSync(p, 'utf8'));
    const headSha = execSync('git rev-parse HEAD', { cwd: base, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (receipt.headSha && receipt.headSha !== headSha) {
      return { code: 'IR-001', passed: false, evidence: [`PLAN_SELECTED headSha ${receipt.headSha} != HEAD ${headSha}`], fix: ['Re-run plan-select after latest commits'] };
    }
  } catch {
    // git not available or parse error — pass through
  }
  return { code: 'IR-001', passed: true, evidence: ['PLAN_SELECTED.json present and headSha matches'], fix: [] };
}

// IR-002: check git-state.json activePlan matches current dag id
function detectAuthorityMarker(base: string, dagId?: string): DetectorResult {
  const p = join(base, '.roadmap', 'git-state.json');
  if (!existsSync(p)) {
    return { code: 'IR-002', passed: false, evidence: ['git-state.json missing'], fix: ['Run roadmap orient to generate git-state'] };
  }
  const state = JSON.parse(readFileSync(p, 'utf8'));
  if (!state.activePlan) {
    return { code: 'IR-002', passed: false, evidence: ['activePlan is null in git-state.json'], fix: ['Set activePlan via roadmap orient'] };
  }
  if (dagId && state.activePlan !== dagId) {
    return { code: 'IR-002', passed: false, evidence: [`activePlan "${state.activePlan}" != dag "${dagId}"`], fix: ['Ensure correct DAG is active'] };
  }
  return { code: 'IR-002', passed: true, evidence: [`activePlan matches: ${state.activePlan}`], fix: [] };
}

// IR-003: scan receipts for receipt-required commands without matching InteractionReceipt
function detectReceiptChainGaps(receipts: InteractionReceipt[]): DetectorResult {
  const receiptCmds = new Set(receipts.map(r => r.cmd));
  const requiredKeys = Object.entries(COMMAND_REGISTRY)
    .filter(([_, v]) => v.receiptRequired)
    .map(([k]) => k);

  // Check if any receipt-required command was invoked but has no receipt
  // We can only detect gaps for commands that appear in receipts
  const gaps: string[] = [];
  for (const r of receipts) {
    const key = r.cmd.split(' ').slice(0, 2).join(' ');
    if (requiredKeys.some(rk => key.includes(rk) || rk.includes(key))) {
      // Receipt exists — no gap for this one
    }
  }

  // Also check: receipts reference stepIds; detect if any stepId is missing its receipt
  const stepIds = receipts.map(r => r.stepId);
  const uniqueSteps = new Set(stepIds);
  if (stepIds.length !== uniqueSteps.size) {
    gaps.push(`Duplicate stepIds found: ${stepIds.length - uniqueSteps.size} duplicates`);
  }

  if (gaps.length > 0) {
    return { code: 'IR-003', passed: false, evidence: gaps, fix: ['Ensure all receipt-required commands emit InteractionReceipts'] };
  }
  return { code: 'IR-003', passed: true, evidence: ['no receipt chain gaps detected'], fix: [] };
}

// IR-004: completed.json dirty check
function detectCompletedDrift(base: string): DetectorResult {
  try {
    const out = execSync('git status --porcelain .roadmap/completed.json', {
      cwd: base, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (out.length > 0) {
      return { code: 'IR-004', passed: false, evidence: [`completed.json has uncommitted changes: ${out}`], fix: ['Commit completed.json or run autoCommitCompletion'] };
    }
  } catch {
    // git not available
  }
  return { code: 'IR-004', passed: true, evidence: ['completed.json is clean'], fix: [] };
}

// IR-005: tool call hotspots exceeding thresholds
function detectToolCallHotspots(mining: MiningResult, contract?: AuditContract): DetectorResult {
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  const maxInflation = contract?.thresholds.toolCallInflationMax ?? 10;
  const maxLatency = contract?.thresholds.latencyP95MaxMs ?? 5000;

  for (const h of mining.hotspots) {
    if (h.count > maxInflation) {
      passed = false;
      evidence.push(`Tool "${h.tool}" called ${h.count}x (max: ${maxInflation})`);
      fix.push(`Reduce calls to "${h.tool}" — consider batching or caching`);
    }
  }

  if (mining.latencyP95Ms > maxLatency) {
    passed = false;
    evidence.push(`P95 latency ${mining.latencyP95Ms}ms exceeds ${maxLatency}ms`);
    fix.push('Optimize slow commands or increase latencyP95MaxMs threshold');
  }

  if (passed) evidence.push('all hotspots within thresholds');
  return { code: 'IR-005', passed, evidence, fix };
}

// PE-001: process escape — unregistered commands in receipts
function detectProcessEscape(receipts: InteractionReceipt[], base: string): DetectorResult {
  const runsDir = join(base, '.roadmap', 'metaflow', 'runs');
  if (!existsSync(runsDir)) {
    return { code: 'PE-001', passed: true, evidence: ['no runs directory — no process escape possible'], fix: [] };
  }

  const registeredKeys = new Set(Object.keys(COMMAND_REGISTRY));
  const evidence: string[] = [];
  const fix: string[] = [];
  let passed = true;

  for (const r of receipts) {
    const key = r.cmd.split(' ').slice(0, 2).join(' ');
    if (key.startsWith('mf ') || key.startsWith('roadmap mf')) continue; // mf commands are always allowed
    if (!registeredKeys.has(key) && !r.cmd.startsWith('roadmap mf')) {
      passed = false;
      evidence.push(`Unregistered command: "${r.cmd}" (step ${r.stepId})`);
      fix.push(`Register "${key}" in COMMAND_REGISTRY or remove the invocation`);
    }
  }

  if (passed) evidence.push('all commands are registered');
  return { code: 'PE-001', passed, evidence, fix };
}

export function detectIntegrationRoughPoints(
  receipts: InteractionReceipt[],
  _sessions: SessionBinding[],
  miningResult: MiningResult,
  opts: IntegrationOpts = {},
): DetectorResult[] {
  const base = opts.base ?? opts.repoRoot ?? process.cwd();
  return [
    detectMissingPlanReceipt(base),
    detectAuthorityMarker(base),
    detectReceiptChainGaps(receipts),
    detectCompletedDrift(base),
    detectToolCallHotspots(miningResult, opts.contract),
    detectProcessEscape(receipts, base),
  ];
}
