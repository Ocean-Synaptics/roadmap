/**
 * Reorder: Phase 10 (API optimization) before Phase 9 (regent executor)
 * Run: node --experimental-strip-types .roadmap/reorder-phases.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(import.meta.dirname, 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Reorder dependencies: phase-8-term → phase-10-term → phase-9-term → term

// 1. api-audit (first phase-10 node) depends on phase-8-term ✓ (already correct)
// phase-10's internal chain: api-audit → sub-entry-points → api-refactor → exports → test → phase-10-term ✓

// 2. agent-bootstrap-spec (first node of phase 9) depends on phase-10-term
// Currently it depends on phase-10-term ✓ (already correct)
dag.nodes['agent-bootstrap-spec'].deps = ['phase-10-term'];

// 3. Make phase-9-term depend on both its current dependencies AND phase-10-term
// This ensures the chain: phase-8 → phase-10 → phase-9 → term
dag.nodes['phase-9-term'].deps.push('phase-10-term');
dag.nodes['phase-9-term'].deps = [...new Set(dag.nodes['phase-9-term'].deps)]; // deduplicate

// 4. Make term depend on phase-9-term (unchanged)
// dag.nodes.term.deps already correct

// Validate
const checkResult = check(dag);
if (!checkResult.done) {
  console.error('❌ DAG validation failed:', checkResult.orphans);
  process.exit(1);
}

const verifyErrors = verify(dag);
if (verifyErrors.length > 0) {
  console.error('❌ Contract violations:', verifyErrors);
  process.exit(1);
}

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✓ Phases reordered: phase-8 → phase-10 → phase-9 → term');
console.log('✓ DAG acyclic, connected, contracts satisfied');
