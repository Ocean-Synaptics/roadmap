// Public API: High-level exports only
// Internal utilities: src/lib/internal/* (do not rely on these)

export type { ValidatorRule, PerfReceipt, AuditSchema } from './protocol/schema.js';
export { define, verify, check, orient } from './protocol/index.js';

// Deprecated: re-exports removed
// See docs/MODULE-STRUCTURE.md for migration guide
