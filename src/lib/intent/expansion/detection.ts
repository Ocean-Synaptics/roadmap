// @module intent/expansion/detection
// @exports IntentFailure, IntentDiagnosis, diagnosisCode, buildDiagnosisBlock, buildIntentDiagnosis, extractIntentFailures, resolveProduces, isInitGateFailure, extractObservationFailures, enrichIntentFailuresWithObservations
// @entry roadmap

import type { ValidationRule, ValidationCheck, IntentJudgment, ObservationResult } from '../../../protocol.ts';
import type { DiagnosisBlock } from '../../judgment-receipt.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntentFailure {
  statement: string;
  threshold: number;
  achieved: number;
  reasoning: string;
  evidence: string[];
  rule: ValidationRule & { type: 'intent' };
  observationFailures?: Array<{ id: string; description: string; evidence: string }>;  // from runtime-explore
  informedBy?: 'runtime-explore' | 'llm' | 'hybrid' | 'unevaluated'; // judgment source
}

// FR-IG-002: Structured diagnosis schema.
export interface IntentDiagnosis {
  code: string;
  affectedNode: string;
  evidenceIds: string[];
  remediationSteps: string[];
  statement: string;
  achievedConfidence: number;
  threshold: number;
  expansionDepth: number;
  observationFailures?: Array<{ id: string; description: string; evidence: string }>;
  informedBy?: 'runtime-explore' | 'llm' | 'hybrid' | 'unevaluated';
  estimatedCost?: number;
  costRatio?: number;
}

/**
 * FR-IG-002: Derive diagnosis code from numeric threshold comparison.
 * Pure structural — no keyword matching on reasoning or statement text.
 */
export function diagnosisCode(achieved: number, threshold: number): string {
  const gap = threshold - achieved;
  if (achieved <= 0) return 'intent-no-confidence';
  if (gap > 0.5) return 'intent-confidence-critical';
  if (gap > 0.2) return 'intent-confidence-low';
  return 'intent-confidence-marginal';
}

// ── Structured Diagnosis ──────────────────────────────────────────────────────

/**
 * Build a structured DiagnosisBlock from an IntentFailure.
 * Code is derived structurally via diagnosisCode() — no keyword matching.
 */
export function buildDiagnosisBlock(nodeId: string, intent: IntentFailure): DiagnosisBlock {
  const code = diagnosisCode(intent.achieved, intent.threshold);
  const evidenceIds = intent.evidence.map((_, i) => `evidence-${i}`);

  const remediationSteps: string[] = [];
  if (intent.rule.context && intent.rule.context.length > 0) {
    remediationSteps.push(`Review context files: ${intent.rule.context.join(', ')}`);
  }
  if (intent.observationFailures && intent.observationFailures.length > 0) {
    remediationSteps.push(
      `Fix failing observations: ${intent.observationFailures.map(o => o.id).join(', ')}`,
    );
  }
  remediationSteps.push(`Achieve confidence >= ${intent.threshold} (currently ${intent.achieved.toFixed(2)})`);

  return { code, affectedNode: nodeId, evidenceIds, remediationSteps };
}

/**
 * FR-IG-002: Build full IntentDiagnosis from a failure + node context.
 */
export function buildIntentDiagnosis(
  nodeId: string,
  intent: IntentFailure,
  expansionDepth: number,
  opts?: { estimatedCost?: number; costRatio?: number },
): IntentDiagnosis {
  const block = buildDiagnosisBlock(nodeId, intent);
  return {
    ...block,
    statement: intent.statement,
    achievedConfidence: intent.achieved,
    threshold: intent.threshold,
    expansionDepth,
    observationFailures: intent.observationFailures,
    informedBy: intent.informedBy,
    estimatedCost: opts?.estimatedCost,
    costRatio: opts?.costRatio,
  };
}

// ── Core extraction ───────────────────────────────────────────────────────────

export function extractIntentFailures(
  checks: ValidationCheck[],
  judgments: IntentJudgment[],
): IntentFailure[] {
  const failures: IntentFailure[] = [];

  for (const check of checks) {
    const rule = check.rule;
    if (rule.type !== 'intent') continue;
    if (check.passed) continue;
    if (!rule.expandOnFail) continue;

    const judgment = judgments.find(j => j.statement === rule.statement);
    if (!judgment) continue;

    failures.push({
      statement: rule.statement,
      threshold: rule.confidence,
      achieved: judgment.confidence,
      reasoning: judgment.reasoning,
      evidence: judgment.evidence ?? [],
      rule,
    });
  }

  return failures;
}

export function resolveProduces(
  parentProduces: readonly string[],
  failure: IntentFailure,
): string[] {
  const context = failure.rule.context;
  if (context && context.length > 0) {
    const contextSet = new Set(context);
    const scoped = parentProduces.filter(p => contextSet.has(p));
    return scoped.length > 0 ? scoped : [...parentProduces];
  }
  return [...parentProduces];
}

/**
 * Detect if an intent failure is an init gate failure (plan clarity context).
 */
export function isInitGateFailure(failure: IntentFailure): boolean {
  const statement = failure.statement.toLowerCase();
  const keywords = ['plan', 'unambiguous', 'clear', 'clarity', 'concrete', 'resolvable', 'executable', 'testable', 'scope', 'produces', 'consumes'];
  return keywords.some(keyword => statement.includes(keyword));
}

// ── Observation integration ────────────────────────────────────────────────────

export function extractObservationFailures(
  observations: ObservationResult[],
): Array<{ id: string; description: string; evidence: string }> {
  return observations
    .filter(obs => !obs.pass)
    .map(obs => ({
      id: obs.id,
      description: obs.id,
      evidence: obs.evidence,
    }));
}

/**
 * Enrich intent failures with observation data from runtime-explore checks.
 */
export function enrichIntentFailuresWithObservations(
  failures: IntentFailure[],
  checks: ValidationCheck[],
): IntentFailure[] {
  return failures.map(failure => {
    const failedObservations = checks
      .filter(c => c.rule.type === 'runtime-explore' && !c.passed && c.observations)
      .flatMap(c => {
        const rule = c.rule as any;
        const observations = rule.observations as any[] ?? [];
        const checkObs = c.observations as ObservationResult[] ?? [];

        return checkObs
          .filter(obs => !obs.pass)
          .map(obs => {
            const spec = observations.find((o: any) => o.id === obs.id);
            return {
              id: obs.id,
              description: spec?.description ?? obs.id,
              evidence: obs.evidence,
            };
          });
      });

    if (failedObservations.length > 0) {
      const hasJudgment = !!failure.reasoning && failure.reasoning.length > 0;
      const informedBy = hasJudgment ? 'hybrid' : 'runtime-explore';
      return { ...failure, observationFailures: failedObservations, informedBy };
    }

    return { ...failure, informedBy: 'llm' as const };
  });
}
