/**
 * roadmap: DAG expansion protocol library
 *
 * Public API surface. Internal functions (detectCycles, fwd, Flat, etc) not exported.
 */

// Core protocol
export {
  define,
  graph,
  check,
  verify,
  order,
  parallelOrder,
  orient,
  reconcile,
  merge,
  branch,
  analyze,
  modify,
  modifyAndCommit,
  validateNode,
  validateGraph,
} from './protocol.ts';

// Predicates for orient()
export { fileExists, gitArtifactExists, compound } from './predicates.ts';

// Typed errors
export { RoadmapError } from './errors.ts';
export type { ErrorCode, RoadmapErrorContext } from './errors.ts';

// Recovery + execution
export { CheckpointManager } from './lib/checkpoint.ts';
export { AuditTrail } from './lib/audit.ts';

// Agent APIs (sealed, no DAG introspection)
export {
  getBrief,
  loadHandoffJournal,
} from './lib/brief.ts';

export {
  checkpoint,
  advance,
  verifyBootstrapSignature,
} from './lib/handoff.ts';

// Versioning + migration
export {
  loadDAG,
  loadDAGFromFile,
} from './lib/versioning.ts';

export {
  checkCompatibility,
  migrateDAG,
} from './lib/versioning.schema.ts';

export { DAGMigrator } from './lib/migrations.ts';

// Type exports
export type {
  Graph,
  NodeSpec,
  Connection,
  Gap,
  Orientation,
  ValidationRule,
  ValidationCheck,
  ValidationResult,
  ModifyAnalysis,
  ModificationRecord,
} from './protocol.ts';

export type {
  GitState,
  Checkpoint,
} from './lib/checkpoint.schema.ts';

export type {
  VersionInfo,
  CompatibilityResult,
} from './lib/versioning.schema.ts';

export type { AuditEntry, AuditSession } from './lib/audit.ts';

export type {
  Brief,
  FinalHandoff,
  InterimHandoff,
} from './lib/brief.ts';
