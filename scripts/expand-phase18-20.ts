#!/usr/bin/env node
// Expand DAG: add Phase 18, 19, 20 nodes retroactively.
// All produced artifacts already exist on disk — orient() marks them done immediately.
// Rewires term.deps from ['phase-17-term'] to ['phase-20-term'].

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// --- Phase 18: Shell validate, silent orient, pending contracts, spec-kit import ---

dag.nodes['shell-validate-rule'] = {
  id: 'shell-validate-rule',
  desc: 'Add shell ValidationRule type — { type: "shell", command, expectExitCode? }. Enables nodes to declare arbitrary shell commands as validation gates. Wired into validateNode and the validate CLI command.',
  produces: ['src/protocol.ts', 'tests/shell-validate.test.ts'],
  consumes: [],
  deps: ['phase-17-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/shell-validate.test.ts' }],
  idempotent: true,
};

dag.nodes['silent-orient'] = {
  id: 'silent-orient',
  desc: 'orient --check: silent, note-exempt batch polling for swarm agents. No trail entry written. Added to NOTE_EXEMPT gate and orient --check path. Prevents trail pollution from high-frequency position checks.',
  produces: ['bin/roadmap.ts', 'tests/silent-orient.test.ts'],
  consumes: [],
  deps: ['phase-17-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/silent-orient.test.ts' }],
  idempotent: true,
};

dag.nodes['pending-contracts'] = {
  id: 'pending-contracts',
  desc: 'ConsumeSpec: string | { artifact, resolvedBy }. Acknowledged pending contracts suppress verify() warnings while the resolver node is still incomplete. Enables DAGs with intentional cross-node artifact handoffs without false-positive verify errors.',
  produces: ['src/protocol.ts', 'tests/pending-contracts.test.ts'],
  consumes: [],
  deps: ['phase-17-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/pending-contracts.test.ts' }],
  idempotent: true,
};

dag.nodes['speckit-import'] = {
  id: 'speckit-import',
  desc: 'roadmap import --from speckit <file.md> --id <dag-id>: parse a tasks.md into a roadmap DAG. parseTasksMd + tasksToDAG in src/lib/speckit-import.ts. CLI wired to cmdImport.',
  produces: ['src/lib/speckit-import.ts', 'tests/speckit-import.test.ts'],
  consumes: [],
  deps: ['phase-17-term'],
  validate: [{ type: 'artifact-exists', target: 'src/lib/speckit-import.ts' }],
  idempotent: true,
};

dag.nodes['phase-18-term'] = {
  id: 'phase-18-term',
  desc: 'Phase 18 complete: shell validate rule, silent orient (--check), pending contracts (ConsumeSpec resolvedBy), and spec-kit import command all operational.',
  produces: [],
  consumes: [],
  deps: ['shell-validate-rule', 'silent-orient', 'pending-contracts', 'speckit-import'],
  validate: [],
  idempotent: true,
};

// --- Phase 19: Agent dispatch API, loop signals, CLI agent commands ---

dag.nodes['agent-dispatch-api'] = {
  id: 'agent-dispatch-api',
  desc: 'readyNodes(): eager dispatch beyond current batch whose deps are met. nextBatch(): orchestrator lookahead with conflict pre-check. criticalPath(): longest-path init→term by node count. All exported from index. orient --ready and --next flags.',
  produces: ['src/protocol.ts', 'tests/ready-nodes.test.ts', 'tests/next-batch.test.ts', 'tests/critical-path.test.ts'],
  consumes: [],
  deps: ['phase-18-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/ready-nodes.test.ts' }],
  idempotent: true,
};

dag.nodes['loop-signal-types'] = {
  id: 'loop-signal-types',
  desc: 'loopTarget + convergenceCheck on NodeSpec. LoopSignal interface in Orientation — present when current batch contains a loop node. Structurally distinguishes terminal nodes from loop nodes. orient --check output includes loop field.',
  produces: ['src/protocol.ts', 'tests/loop-target.test.ts'],
  consumes: [],
  deps: ['phase-18-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/loop-target.test.ts' }],
  idempotent: true,
};

dag.nodes['cli-agent-commands'] = {
  id: 'cli-agent-commands',
  desc: 'New CLI commands: show <node-id> (full node spec as JSON), commit --node <id> (stages produces + [node: X] trailer), checkpoint --label, diff. install-hooks wired to dispatch + extended to all four hooks (pre-commit, post-commit, commit-msg, prepare-commit-msg). Shell wrapper for .ts hook sources.',
  produces: [
    'bin/roadmap.ts',
    'hooks/commit-msg',
    'hooks/prepare-commit-msg',
    'tests/show.test.ts',
    'tests/checkpoint-cmd.test.ts',
    'tests/commit-cmd.test.ts',
    'tests/dag-diff.test.ts',
  ],
  consumes: [],
  deps: ['phase-18-term'],
  validate: [{ type: 'artifact-exists', target: 'tests/show.test.ts' }],
  idempotent: true,
};

dag.nodes['orient-staged-flag'] = {
  id: 'orient-staged-flag',
  desc: 'orient --staged: per-node isomorphism check — do staged files exactly match a node\'s produces? Returns { files, matches, extraFiles, isomorphic }. Enforces one-commit-per-node at the orient level rather than only at the pre-commit hook level.',
  produces: ['bin/roadmap.ts'],
  consumes: [],
  deps: ['phase-18-term'],
  validate: [{ type: 'shell', command: 'node --experimental-strip-types bin/roadmap.ts help 2>&1 | grep -q "orient --staged"' }],
  idempotent: true,
};

dag.nodes['phase-19-term'] = {
  id: 'phase-19-term',
  desc: 'Phase 19 complete: agent dispatch API (readyNodes/nextBatch/criticalPath), loop signal types, CLI agent commands (show/commit/checkpoint/diff/install-hooks), orient --staged isomorphism check all operational.',
  produces: [],
  consumes: [],
  deps: ['agent-dispatch-api', 'loop-signal-types', 'cli-agent-commands', 'orient-staged-flag'],
  validate: [],
  idempotent: true,
};

// --- Phase 20: Complete command, ambient, loop validation, iter-id, ergonomics fixes ---

dag.nodes['complete-command'] = {
  id: 'complete-command',
  desc: 'roadmap complete <node-id>: atomic claim → checkpoint → reorient → auto-advance when last in batch. --no-advance to suppress auto-advance. Eliminates 5-call agent sequence (claim + checkpoint + orient + advance + trail) to 1 call.',
  produces: ['bin/roadmap.ts'],
  consumes: [],
  deps: ['phase-19-term'],
  validate: [{ type: 'shell', command: 'node --experimental-strip-types bin/roadmap.ts help 2>&1 | grep -q "complete <node"' }],
  idempotent: true,
};

dag.nodes['ambient-field'] = {
  id: 'ambient-field',
  desc: 'NodeSpec.ambient: readonly string[] of files agent reads for context but that don\'t gate readiness or appear in dependency resolution. Decouples "I need this to read" from "I need this to unblock." Threaded through Flat type, surfaced in show output alongside consumes.',
  produces: ['src/protocol.ts', 'bin/roadmap.ts'],
  consumes: [],
  deps: ['phase-19-term'],
  validate: [],
  idempotent: true,
};

dag.nodes['loop-validation'] = {
  id: 'loop-validation',
  desc: 'convergenceCheck schema enforcement: define() rejects unknown keys (valid: maxCoverageDelta, requireEmptyProposals, minWallClockDeltaMs). loopTarget reference validation: check() emits orphan entry for any loopTarget that doesn\'t exist as a node ID. Previously both were silent.',
  produces: ['src/protocol.ts'],
  consumes: [],
  deps: ['phase-19-term'],
  validate: [],
  idempotent: true,
};

dag.nodes['iter-id-command'] = {
  id: 'iter-id-command',
  desc: 'roadmap iter-id: .roadmap/iter.json counter (--increment, --reset). Canonical loop iteration number for artifact namespacing (evidence-iter-3.json). orient output includes iteration field when iter.json exists — agents get loop context in the standard orient call.',
  produces: ['bin/roadmap.ts'],
  consumes: [],
  deps: ['phase-19-term'],
  validate: [{ type: 'shell', command: 'node --experimental-strip-types bin/roadmap.ts help 2>&1 | grep -q "iter-id"' }],
  idempotent: true,
};

dag.nodes['ergonomics-fixes'] = {
  id: 'ergonomics-fixes',
  desc: 'Parameter property syntax fix (checkpoint.ts, audit.ts — Node 25 strip-only crash). checkpoint --label note-optional (synthesizes from label). orient --ready includes myClaims[] for current-batch owned nodes. Pre-commit: single orient call (3→1 spawns on failure).',
  produces: ['src/lib/checkpoint.ts', 'src/lib/audit.ts', 'hooks/pre-commit', 'bin/roadmap.ts'],
  consumes: [],
  deps: ['phase-19-term'],
  validate: [],
  idempotent: true,
};

dag.nodes['phase-20-term'] = {
  id: 'phase-20-term',
  desc: 'Phase 20 complete: complete command with auto-advance, NodeSpec.ambient, convergenceCheck/loopTarget validation, iter-id, ergonomics fixes (parameter properties, note-optional checkpoint, myClaims, single orient spawn) all operational.',
  produces: [],
  consumes: [],
  deps: ['complete-command', 'ambient-field', 'loop-validation', 'iter-id-command', 'ergonomics-fixes'],
  validate: [],
  idempotent: true,
};

// Rewire term to depend on phase-20-term instead of phase-17-term
dag.nodes['term'] = {
  ...dag.nodes['term'],
  deps: ['phase-20-term'],
};

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log('Expanded: +15 nodes (Phase 18–20), term rewired to phase-20-term');
