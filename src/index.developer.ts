/**
 * @module developer
 * @entry roadmap/developer
 *
 * Roadmap.ts developer API.
 * For developers who write roadmap.ts files to define their DAGs.
 */

// Core protocol + types
export {
  define, graph, check, verify, order, parallelOrder, orient, reconcile, merge, branch,
  analyze, modify, modifyAndCommit, validateNode, validateGraph,
} from './protocol.ts';

export type {
  Graph, NodeSpec, Orientation, Connection, Gap, ValidationRule, ValidationCheck,
  ValidationResult, ModifyAnalysis, ModificationRecord,
} from './protocol.ts';

// Predicates for orient()
export { fileExists, gitArtifactExists, gitArtifactAt, siblingArtifactExists, compound, any } from './predicates.ts';

// Errors
export { RoadmapError } from './errors.ts';
export type { ErrorCode, RoadmapErrorContext } from './errors.ts';

// Versioning
export { loadDAG, loadDAGFromFile } from './lib/versioning.ts';
export { checkCompatibility, migrateDAG } from './lib/versioning.schema.ts';
export { DAGMigrator } from './lib/migrations.ts';
export type { VersionInfo, CompatibilityResult } from './lib/versioning.schema.ts';
