// @module intent/expansion/gaps
// @exports PlanClarityGap, extractPlanClarityGaps, EvidenceMode, EvidenceItem, validateEvidenceAlgebra, ExpansionReceipt, writeExpansionReceipt, checkSiblingInvariants
// @entry roadmap

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IntentFailure } from './detection.ts';

// ── Plan clarity gaps ─────────────────────────────────────────────────────────

export interface PlanClarityGap {
  type: 'VagueProduces' | 'UnresolvableConsumes' | 'NoValidate' | 'OwnershipConflict' | 'BroadScope';
  node: string;
  detail: string;
}

/**
 * Parse plan clarity gaps from the init gate failure's reasoning and evidence.
 * Returns structured gap descriptions that map to fix node categories.
 */
export function extractPlanClarityGaps(
  failure: IntentFailure,
): PlanClarityGap[] {
  const gaps: PlanClarityGap[] = [];
  const reasoning = failure.reasoning.toLowerCase();
  const evidence = failure.evidence.map(e => e.toLowerCase());
  const allText = [reasoning, ...evidence].join(' ');

  // Vague produces: placeholder names, non-file patterns, abstract descriptions
  if (allText.includes('produces') && (allText.includes('placeholder') || allText.includes('abstract') || allText.includes('vague'))) {
    gaps.push({
      type: 'VagueProduces',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'produces contains placeholders or non-concrete paths',
    });
  }

  // Unresolvable consumes: artifacts not produced by predecessors
  if (allText.includes('consumes') && (allText.includes('not found') || allText.includes('no producer') || allText.includes('unresolvable'))) {
    gaps.push({
      type: 'UnresolvableConsumes',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'consumes references artifacts without producers',
    });
  }

  // No validate: missing validation rules
  if (allText.includes('validate') && (allText.includes('no validate') || allText.includes('missing validate') || allText.includes('not testable'))) {
    gaps.push({
      type: 'NoValidate',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'no validation rules defined',
    });
  }

  // Ownership conflict: multiple nodes claim same output or unclear ownership
  if (allText.includes('ownership') || allText.includes('conflict') || allText.includes('duplicate') || allText.includes('overlapping')) {
    gaps.push({
      type: 'OwnershipConflict',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'overlapping produces or unclear ownership',
    });
  }

  // Broad scope: node description has multiple concerns
  if (allText.includes('scope') && (allText.includes('broad') || allText.includes('multiple') || allText.includes('and') || allText.includes('also'))) {
    gaps.push({
      type: 'BroadScope',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: 'node scope covers multiple concerns',
    });
  }

  return gaps.length > 0 ? gaps : [
    {
      type: 'VagueProduces',
      node: failure.reasoning.split('\n')[0] || 'unknown',
      detail: failure.reasoning,
    },
  ];
}

// ── Evidence Algebra ──────────────────────────────────────────────────────────

export type EvidenceMode = 'observation' | 'assertion' | 'counter';

export interface EvidenceItem {
  id: string;
  content: string;
  mode: EvidenceMode;
}

/**
 * Validate evidence algebra before committing expansion.
 * Confirmation requires: >=1 observation + >=1 assertion + 0 counter-evidence.
 */
export function validateEvidenceAlgebra(evidence: EvidenceItem[]): { valid: boolean; reason?: string } {
  const observations = evidence.filter(e => e.mode === 'observation');
  const assertions = evidence.filter(e => e.mode === 'assertion');
  const counters = evidence.filter(e => e.mode === 'counter');

  if (counters.length > 0) {
    return { valid: false, reason: `counter-evidence present: ${counters.map(c => c.id).join(', ')}` };
  }
  if (observations.length === 0) {
    return { valid: false, reason: 'confirmation requires at least one observation' };
  }
  if (assertions.length === 0) {
    return { valid: false, reason: 'confirmation requires at least one assertion' };
  }
  return { valid: true };
}

// ── Expansion Receipt ─────────────────────────────────────────────────────────

export interface ExpansionReceipt {
  expansionId: string;
  parentNodeId: string;
  childNodeIds: string[];
  siblingInvariants: string[];
  timestamp: string;
}

const EXPANSION_RECEIPTS_PATH = (repoRoot: string) =>
  join(repoRoot, '.roadmap', 'expansion-receipts.jsonl');

export function writeExpansionReceipt(receipt: ExpansionReceipt, repoRoot: string): void {
  appendFileSync(EXPANSION_RECEIPTS_PATH(repoRoot), JSON.stringify(receipt) + '\n', 'utf-8');
}

/**
 * Verify no two sibling child nodes produce the same path.
 */
export function checkSiblingInvariants(children: Array<{ nodeId: string; produces: string[] }>): string[] {
  const pathWriters = new Map<string, string[]>();
  for (const child of children) {
    for (const path of child.produces) {
      const writers = pathWriters.get(path) ?? [];
      writers.push(child.nodeId);
      pathWriters.set(path, writers);
    }
  }
  const violations: string[] = [];
  for (const [path, writers] of pathWriters) {
    if (writers.length > 1) violations.push(`${writers.join(' and ')} both produce '${path}'`);
  }
  return violations;
}
