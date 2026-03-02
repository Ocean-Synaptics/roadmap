// @module intent-expansion (barrel — re-exports from expansion/)
// @exports IntentFailure, IntentDiagnosis, diagnosisCode, PlanClarityGap, ConvergenceLimits, CostHistory, FixNodeSpec, ExpansionResult, generateIntentExpansion, generateInitGateExpansion, resolveProduces, isInitGateFailure, extractPlanClarityGaps, detectStall, buildEscalation, extractIntentFailures, extractObservationFailures, enrichIntentFailuresWithObservations, fixNodeCost, buildDiagnosisBlock, EvidenceMode, EvidenceItem, validateEvidenceAlgebra, ExpansionReceipt, writeExpansionReceipt, checkSiblingInvariants, ConvergenceIteration, ConvergenceHistory, recordConvergenceIteration, readConvergenceHistory
// @entry roadmap

// detection: types, extraction, diagnosis
export {
  diagnosisCode, buildDiagnosisBlock, buildIntentDiagnosis,
  extractIntentFailures, resolveProduces, isInitGateFailure,
  extractObservationFailures, enrichIntentFailuresWithObservations,
} from './expansion/detection.ts';
export type { IntentFailure, IntentDiagnosis } from './expansion/detection.ts';

// gaps: plan clarity, evidence algebra, expansion receipts
export { extractPlanClarityGaps, validateEvidenceAlgebra, writeExpansionReceipt, checkSiblingInvariants } from './expansion/gaps.ts';
export type { PlanClarityGap, EvidenceMode, EvidenceItem, ExpansionReceipt } from './expansion/gaps.ts';

// proposals: expansion generation, cost, convergence
export type { EscalationResult } from './expansion/proposals.ts';
export {
  generateIntentExpansion, generateInitGateExpansion,
  fixNodeCost, detectStall, buildEscalation,
  recordConvergenceIteration, readConvergenceHistory,
} from './expansion/proposals.ts';
export type { ConvergenceLimits, CostHistory, FixNodeSpec, ExpansionResult, ConvergenceIteration, ConvergenceHistory } from './expansion/proposals.ts';
