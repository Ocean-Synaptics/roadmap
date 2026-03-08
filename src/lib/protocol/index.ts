// @module protocol
// Barrel exports for protocol layer. Core algebra from src/core/, IO from src/runtime/.

// Types
export type {
  ValidationRule, IntentJudgment,
  ValidationCheck, ValidationResult, IntentFailure, ConvergenceLimits, EscalationResult,
  IntentDiagnosis, ConsumeSpec, NodeSpec, EmitGalleryNodeSpec, TermGate, SpecMeta,
  Graph, Connection, Gap, OptimizeResult, LevelEntry, BottleneckEntry, ModificationRecord,
} from './types.ts';
export { consumeArtifact, consumeResolvedBy, graph, CompletionStore } from './types.ts';

// Core algebra (pure — zero IO)
export { define, verify, check } from '../../core/graph.ts';
export type { Flat } from '../../core/graph.ts';

export { order, parallelOrder, criticalPath, batchConflicts } from '../../core/order.ts';
export type { BatchConflict } from '../../core/order.ts';

export { orient } from '../../core/orient.ts';
export type { LoopSignal, PlanReceipt, Orientation } from '../../core/orient.ts';

export { advanceBatch, readyNodes, nextBatch } from '../../core/batch.ts';
export type { ReadyNode, NextBatch } from '../../core/batch.ts';

export { reconcile, mergeCheck, branchWithWitness, merge, branch, analyze, modify } from '../../core/reconcile.ts';
export type { MergeConflict, BranchWitness, ModifyAnalysis } from '../../core/reconcile.ts';

// Runtime IO
export { modifyAndCommit } from '../../runtime/mutate.ts';

// Validation
export { validateNode, validateBatch, validateGraph } from './validation.ts';

// Schema (co-located)
export type { ValidatorRule, PerfReceipt, AuditSchema } from './schema.ts';
export { VALIDATORS } from './schema.ts';
