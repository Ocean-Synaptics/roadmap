#!/usr/bin/env node
// Merge fr-rm-hallucination-protocol-014 into fr-rm-audit-stack as a parallel track.
//
// Convergence edges added:
//   rm-strategy-propose-select-cli  += rm-completion-autocommit   (bin/roadmap.ts serialization)
//   rm-strategy-audit-detectors     += intent-metaflow-audit-required  (audit system must be stable)
//   intent-strategy-nonforgetting   += intent-metaflow-self-inserting-sovereign  (spec Depends-on 013)
//
// Resulting term: intent-strategy-nonforgetting
// Peak parallelism: 4 workers at L03

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const headPath = join(root, '.roadmap', 'head.json');

// Restore fr-rm-audit-stack from git as the base DAG
const auditStack = JSON.parse(
  execSync('git show 83a3067:.roadmap/head.json', { cwd: root }).toString()
);

// 014 nodes with cross-DAG deps wired in
const nodes014: Record<string, object> = {
  'rm-strategy-contract': {
    id: 'rm-strategy-contract',
    desc: 'Existing codebase — src/lib/strategy/ (if any), bin/roadmap.ts, src/lib/metaflow/audit/, .roadmap/strategy.json',
    produces: ['bin/roadmap.ts', 'src/lib/metaflow/audit/required-schema.ts'],
    consumes: [],
    deps: ['rm-audit-contract'],
    validate: [{ type: 'artifact-exists', target: 'src/lib/metaflow/audit/required-schema.ts' }],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'rm-strategy-registry': {
    id: 'rm-strategy-registry',
    desc: 'Implement strategy registry + schema generation; ship REGISTRY.json. src/lib/strategy/registry.ts: StrategyConfig type; registry array with HALLUCINATE_ROUNDS_THEN_VALIDATE (rounds:2, gateMode:terminal, risk:medium), VALIDATE_AS_YOU_GO (rounds:1, gateMode:per-batch, risk:low), HYBRID (rounds:2, gateMode:per-phase, risk:medium); getStrategy(id); listStrategies(). src/lib/strategy/schema.ts: StrategyConfig, StrategyReceipt ({schema_version:1, strategyId, runId, headSha, treeSha, selectionMethod:auto|ask|manual, candidateSetHash, config, evidence, selectedAt}), ActiveStrategy ({schema_version:1, strategyId, runId, latchedAt, boundAt, receiptPath}). .roadmap/strategy/REGISTRY.json: generated from registry array. tests/strategy/registry.test.ts: 6 tests.',
    produces: [
      'src/lib/strategy/registry.ts',
      'src/lib/strategy/schema.ts',
      '.roadmap/strategy/REGISTRY.json',
      'tests/strategy/registry.test.ts',
    ],
    consumes: [],
    deps: ['rm-strategy-contract'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit && npx vitest run tests/strategy/registry.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'rm-strategy-hint-latch': {
    id: 'rm-strategy-hint-latch',
    desc: 'Implement hint detection + per-run latch persistence. src/lib/strategy/hints.ts: HINT_TOKENS=[hallucinate,swarm,parallel,lookahead,fidelity,mass parallel,validate later]; detectHint(text) → {latched,matchedTokens}; shouldLatch(note). src/lib/strategy/active.ts: readActiveLatch; writeLatch; clearLatch; isLatched; readActiveStrategy; writeActiveStrategy → .roadmap/strategy/active.json. tests/strategy/hints.test.ts: 8 tests — detectHint("using our hallucination approach") → latched:true; detectHint("normal work") → latched:false; shouldLatch matches on any token; writeLatch/isLatched/clearLatch round-trip.',
    produces: [
      'src/lib/strategy/hints.ts',
      'src/lib/strategy/active.ts',
      'tests/strategy/hints.test.ts',
    ],
    consumes: [],
    deps: ['rm-strategy-registry'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit && npx vitest run tests/strategy/hints.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'rm-strategy-propose-select-cli': {
    id: 'rm-strategy-propose-select-cli',
    desc: 'CLI commands propose/select/auto/status/clear with receipts + renderers. src/lib/strategy/select.ts: proposeCandidates; selectStrategy → writes StrategyReceipt to .roadmap/receipts/strategy-select-<ts>.json + ActiveStrategy to .roadmap/strategy/active.json; autoSelect (maxParallelism>2 → HALLUCINATE else VALIDATE_AS_YOU_GO); clearStrategy. src/lib/render/strategy.ts: renderCandidates (table: ID|Name|Rounds|Gate|Risk); renderActive; renderReceipt. Wire into bin/roadmap.ts: strategy propose/select/auto/status/clear; orient --note parsing calls shouldLatch → if latched+no strategy include strategyRequired:true + candidates. tests/cli/strategy.test.ts: 10 tests.',
    produces: [
      'src/lib/strategy/select.ts',
      'src/lib/render/strategy.ts',
      'bin/roadmap.ts',
      'tests/cli/strategy.test.ts',
    ],
    consumes: [],
    // Serializes with rm-completion-autocommit: both write bin/roadmap.ts
    deps: ['rm-strategy-hint-latch', 'rm-completion-autocommit'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit && npx vitest run tests/cli/strategy.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'rm-strategy-exec-gate': {
    id: 'rm-strategy-exec-gate',
    desc: 'Gate dispatch/complete when latch=true and no active strategy. src/lib/strategy/exec-gate.ts: checkStrategyGate(base?) → if isLatched AND readActiveStrategy===null → {blocked:true, code:STRATEGY_REQUIRED, fix:[...]} else {blocked:false}; no env bypass. Wire into bin/roadmap.ts: dispatch and complete call checkStrategyGate at entry; blocked → stderr JSON + exit(4). tests/cli/strategy-gate.test.ts: 6 tests.',
    produces: [
      'src/lib/strategy/exec-gate.ts',
      'tests/cli/strategy-gate.test.ts',
    ],
    consumes: [],
    deps: ['rm-strategy-propose-select-cli'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit && npx vitest run tests/cli/strategy-gate.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'rm-strategy-audit-detectors': {
    id: 'rm-strategy-audit-detectors',
    desc: 'Strategy compliance detectors for audit tail. src/lib/metaflow/audit/detectors/strategy.ts: detectStrategyCompliance → DetectorResult[]. STRAT-001 detectLatchWithoutStrategy: latch file exists+no receipt → finding. STRAT-002 detectStrategyHeadShaMatch: receipt.headSha !== git HEAD → finding. STRAT-003 detectMissingStrategyReceipt: dispatch/complete receipt exists but no matching strategy receipt → finding. Register STRAT-001/002/003 in REQUIRED.json requiredDetectors. tests/audit/strategy-detectors.test.ts: 8 tests.',
    produces: [
      'src/lib/metaflow/audit/detectors/strategy.ts',
      'tests/audit/strategy-detectors.test.ts',
    ],
    consumes: [],
    // intent-metaflow-audit-required: audit system (REQUIRED.json, detector infrastructure) is stable
    deps: ['rm-strategy-exec-gate', 'intent-metaflow-audit-required'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit && npx vitest run tests/audit/strategy-detectors.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
  },
  'intent-strategy-nonforgetting': {
    id: 'intent-strategy-nonforgetting',
    desc: 'Terminal intent — once hint-latched, roadmap proposes concrete strategy candidates, requires selection receipt, binds to run, and never asks user to restate the approach. Governs both strategy protocol and the full audit+compliance+sovereignty stack.',
    produces: [],
    consumes: [],
    // Full audit stack (013) must be complete; strategy detectors must be wired
    deps: ['rm-strategy-audit-detectors', 'intent-metaflow-self-inserting-sovereign'],
    validate: [
      { type: 'shell', command: 'npx vitest run tests/cli/strategy.test.ts' },
      { type: 'shell', command: 'npx vitest run tests/cli/strategy-gate.test.ts' },
      { type: 'shell', command: 'npx vitest run tests/audit/strategy-detectors.test.ts' },
      {
        type: 'intent',
        statement: 'Once a user hints at hallucination/parallelism strategy via any hint token, roadmap proposes 3 structured strategy candidates, gates dispatch/complete with STRATEGY_REQUIRED until selection, writes a receipt, binds to the run, and all subsequent commands reuse the binding without questioning the user',
        confidence: 0.9,
        evaluator: 'self',
        expandOnFail: true,
      },
    ],
    idempotent: true,
    expandedFrom: 'fr-rm-hallucination-protocol-014',
    mode: 'plan',
  },
};

// Merge: take audit-stack as base, add 014 nodes, update term
const merged = {
  ...auditStack,
  id: 'fr-rm-audit-and-strategy-stack',
  desc: 'FR-RM-AUDIT-STACK (010+012+013) merged with FR-RM-HALLUCINATION-PROTOCOL-014 — parallel execution track with 4-worker peak at L03',
  term: 'intent-strategy-nonforgetting',
  nodes: {
    ...auditStack.nodes,
    ...nodes014,
  },
};

writeFileSync(headPath, JSON.stringify(merged, null, 2));
console.log(
  `Merged: ${Object.keys(auditStack.nodes).length} audit-stack nodes + ${Object.keys(nodes014).length} strategy-014 nodes = ${Object.keys(merged.nodes).length} total`
);
console.log(`init: ${merged.init}  term: ${merged.term}`);
