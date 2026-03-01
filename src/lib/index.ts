// Main library exports
// All types consolidated in src/lib/schema.ts

export {
  ValidatorRule,
  PerfReceipt,
  AuditSchema
} from './schema';

export { define, verify, check, orient } from './protocol';
export { RoadmapError } from './errors';

// Deprecated re-exports removed; import directly from schema.ts
