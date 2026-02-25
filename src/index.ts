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

// Recovery + execution
export { CheckpointManager } from './checkpoint.ts';
export { AuditTrail } from './audit.ts';

// Versioning + migration
export {
  loadDAG,
  loadDAGFromFile,
} from './versioning.ts';

export {
  checkCompatibility,
  migrateDAG,
} from './versioning.schema.ts';

export { DAGMigrator } from './migrations.ts';

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
} from './checkpoint.schema.ts';

export type {
  VersionInfo,
  CompatibilityResult,
} from './versioning.schema.ts';

export type { AuditEntry, AuditSession } from './audit.ts';
