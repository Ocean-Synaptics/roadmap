// @module intent-expansion
// @exports IntentFailure, ConvergenceLimits, ExpansionResult, EscalationResult, generateIntentExpansion, resolveProduces, detectStall, buildEscalation
// @entry roadmap

import type { ValidationRule, ValidationCheck, IntentJudgment } from '../protocol.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntentFailure {
  statement: string;
  threshold: number;
  achieved: number;
  reasoning: string;
  evidence: string[];
  rule: ValidationRule & { type: 'intent' };
}

export interface ConvergenceLimits {
  maxExpansionDepth: number;   // hard recursion limit (default: 3)
  stallThreshold: number;      // min confidence improvement per level (default: 0.05)
  maxExpansionCost?: number;   // USD budget cap (optional)
}

export interface FixNodeSpec {
  id: string;
  desc: string;
  expandedFrom: string;
  produces: string[];
  consumes: string[];
  ambient?: string[];
  validate: ValidationRule[];
  idempotent: boolean;
  _intentDiagnosis: {
    statement: string;
    achievedConfidence: number;
    threshold: number;
    reasoning: string;
    evidence: string[];
    expansionDepth: number;
  };
}

export interface ExpansionResult {
  status: 'expanding';
  fixNodes: FixNodeSpec[];
  depth: number;
}

export interface EscalationResult {
  status: 'escalated';
  node: string;
  statement: string;
  history: Array<{ depth: number; confidence: number }>;
  diagnosis: string;
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded';
}

const DEFAULT_LIMITS: ConvergenceLimits = {
  maxExpansionDepth: 3,
  stallThreshold: 0.05,
};

// ── Core ──────────────────────────────────────────────────────────────────────

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
  // If intent rule has context paths, scope fix node to those
  const context = failure.rule.context;
  if (context && context.length > 0) {
    // Filter parent produces to only those in context
    const contextSet = new Set(context);
    const scoped = parentProduces.filter(p => contextSet.has(p));
    return scoped.length > 0 ? scoped : [...parentProduces];
  }
  return [...parentProduces];
}

export function generateIntentExpansion(
  parentId: string,
  parentProduces: readonly string[],
  parentConsumes: readonly string[],
  parentAmbient: readonly string[] | undefined,
  parentValidate: readonly ValidationRule[],
  failures: IntentFailure[],
  depth: number,
  limits?: Partial<ConvergenceLimits>,
): ExpansionResult {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const deterministicRules = parentValidate.filter(r => r.type !== 'intent' && r.type !== 'runtime-explore');

  const fixNodes: FixNodeSpec[] = failures.map((f, i) => {
    const maxDepth = f.rule.maxExpansionDepth ?? resolved.maxExpansionDepth;
    const canExpandFurther = depth + 1 < maxDepth;

    return {
      id: `${parentId}-fix-${i}`,
      desc: `Fix: ${f.statement} (confidence ${f.achieved.toFixed(2)}/${f.threshold})`,
      expandedFrom: parentId,
      produces: resolveProduces(parentProduces, f),
      consumes: [...parentProduces], // reads current state
      ambient: parentAmbient ? [...parentAmbient] : undefined,
      validate: [
        // The failing intent — fix node's acceptance test
        {
          ...f.rule,
          expandOnFail: canExpandFurther,
          maxExpansionDepth: f.rule.maxExpansionDepth,
        },
        // Plus deterministic gates from parent
        ...deterministicRules,
      ],
      idempotent: true,
      _intentDiagnosis: {
        statement: f.statement,
        achievedConfidence: f.achieved,
        threshold: f.threshold,
        reasoning: f.reasoning,
        evidence: f.evidence,
        expansionDepth: depth + 1,
      },
    };
  });

  return { status: 'expanding', fixNodes, depth: depth + 1 };
}

// ── Convergence checks ────────────────────────────────────────────────────────

export function detectStall(
  history: Array<{ depth: number; confidence: number }>,
  currentConfidence: number,
  limits?: Partial<ConvergenceLimits>,
): boolean {
  if (history.length === 0) return false;

  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const lastConfidence = history[history.length - 1].confidence;
  const improvement = currentConfidence - lastConfidence;

  return improvement < resolved.stallThreshold;
}

export function buildEscalation(
  nodeId: string,
  statement: string,
  history: Array<{ depth: number; confidence: number }>,
  reason: 'depth-exceeded' | 'stalled' | 'budget-exceeded',
): EscalationResult {
  const diagnosis = reason === 'stalled'
    ? `Confidence stalled at ${history[history.length - 1]?.confidence.toFixed(2)} across ${history.length} expansion levels. Fix attempts are not converging.`
    : reason === 'depth-exceeded'
    ? `Maximum expansion depth (${history.length}) reached without meeting threshold. Systematic issue likely requires different approach.`
    : `Expansion budget exceeded. ${history.length} levels consumed without convergence.`;

  return {
    status: 'escalated',
    node: nodeId,
    statement,
    history,
    diagnosis,
    reason,
  };
}
