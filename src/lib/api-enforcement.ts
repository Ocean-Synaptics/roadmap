// @module api-enforcement
// @exports validateApiCoverage, ApiCoverageResult
// @entry roadmap

import { schemas } from './schemas.ts';

// Commands that MUST have schemas — derived from the router's dispatch table.
// Excludes meta commands (help, api, status) that are self-describing or exempt.
export const CANONICAL_COMMANDS: readonly string[] = [
  'make',
  'orient',
  'advance',
  'dag.insert',
  'dag.remove',
  'dag.modify',
  'spec.plan',
  'spec.plan.gallery',
  'spec.plan.select',
  'spec.plan.status',
];

export interface ApiViolation {
  command: string;
  issue: string;
}

export interface ApiCoverageResult {
  ok: boolean;
  violations: ApiViolation[];
}

// validateApiCoverage checks three rules:
//   1. Every canonical command has a schema entry
//   2. Every schema entry has description + at least one example
//   3. No orphan schemas (schema exists but command is not canonical)
export function validateApiCoverage(): ApiCoverageResult {
  const violations: ApiViolation[] = [];
  const schemaKeys = new Set(Object.keys(schemas));
  const canonicalSet = new Set(CANONICAL_COMMANDS);

  // Rule 1: every canonical command must have a schema
  for (const cmd of CANONICAL_COMMANDS) {
    if (!schemaKeys.has(cmd)) {
      violations.push({ command: cmd, issue: 'missing schema entry' });
    }
  }

  // Rule 2: every schema must have description + at least one example
  for (const [cmd, schema] of Object.entries(schemas)) {
    if (!schema.description || schema.description.trim() === '') {
      violations.push({ command: cmd, issue: 'missing description' });
    }
    if (!schema.examples || schema.examples.length === 0) {
      violations.push({ command: cmd, issue: 'missing examples (at least one required)' });
    }
  }

  // Rule 3: no orphan schemas
  for (const cmd of schemaKeys) {
    if (!canonicalSet.has(cmd)) {
      violations.push({ command: cmd, issue: 'orphan schema — command not in CANONICAL_COMMANDS' });
    }
  }

  return { ok: violations.length === 0, violations };
}
