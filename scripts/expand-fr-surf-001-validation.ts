#!/usr/bin/env npx tsx
// @description Expand FR-SURF-001 L1 batch into granular validation nodes
// @pattern Validate DAG structure before implementation

import type { Graph } from '../src/index.js';

/**
 * Expand L1 coarse nodes into finer-grained validation sub-tasks.
 * Purpose: Test DAG structure, dependency flow, and terminal gate logic.
 *
 * Strategy:
 * - Each L1 node expanded into: schema + tests + integration sub-nodes
 * - Creates more parallelism: 6 nodes → ~15-20 validation nodes
 * - Smaller scope per node = easier to complete + validate
 * - Terminal gate can validate earlier with more fine-grained structure
 */

export function expand(g: Graph): Graph {
  const nodes = g.nodes;

  // Expand audit schema node
  if (nodes['surf-audit-schema']) {
    nodes['audit-schema-types'] = {
      id: 'audit-schema-types',
      desc: 'SURFACE/PLAN/RESULT TypeScript type definitions',
      produces: ['src/lib/audit/audit-schema.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['audit-schema-validators'] = {
      id: 'audit-schema-validators',
      desc: 'Runtime validators for audit envelopes',
      produces: ['src/lib/audit/audit-validators.ts'],
      consumes: ['src/lib/audit/audit-schema.ts'],
      deps: ['audit-schema-types'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    // Original node now depends on sub-nodes
    nodes['surf-audit-schema'].deps = ['audit-schema-validators'];
    nodes['surf-audit-schema'].produces = [];
    nodes['surf-audit-schema'].validate = [{ type: 'expanded', minNodes: 2 }];
  }

  // Expand perf schema
  if (nodes['surf-perf-schema']) {
    nodes['perf-schema-types'] = {
      id: 'perf-schema-types',
      desc: 'PerfReceipt, Baseline, Regression type definitions',
      produces: ['src/lib/perf/perf-schema.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['perf-schema-tests'] = {
      id: 'perf-schema-tests',
      desc: 'Type validation + parsing tests for perf receipts',
      produces: ['tests/perf-schema.test.ts'],
      consumes: ['src/lib/perf/perf-schema.ts'],
      deps: ['perf-schema-types'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['surf-perf-schema'].deps = ['perf-schema-tests'];
    nodes['surf-perf-schema'].produces = [];
    nodes['surf-perf-schema'].validate = [{ type: 'expanded', minNodes: 2 }];
  }

  // Expand CLI registry
  if (nodes['surf-cli-registry']) {
    nodes['cli-registry-types'] = {
      id: 'cli-registry-types',
      desc: 'CommandRegistry and subcommand dispatch types',
      produces: ['src/cli/registry.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['cli-main-entry'] = {
      id: 'cli-main-entry',
      desc: 'bin/cli.ts — main entrypoint with registry dispatch',
      produces: ['bin/cli.ts'],
      consumes: ['src/cli/registry.ts'],
      deps: ['cli-registry-types'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['surf-cli-registry'].deps = ['cli-main-entry'];
    nodes['surf-cli-registry'].produces = [];
    nodes['surf-cli-registry'].validate = [{ type: 'expanded', minNodes: 2 }];
  }

  // Expand layout plan
  if (nodes['surf-layout-plan']) {
    nodes['layout-spec-rules'] = {
      id: 'layout-spec-rules',
      desc: 'Define target layout rules from FR-SURF-001 spec',
      produces: ['src/lib/audit/layout-rules.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['layout-derive-plan'] = {
      id: 'layout-derive-plan',
      desc: 'Derive move plan from rules (src/lib/audit/layout-plan.ts)',
      produces: ['src/lib/audit/layout-plan.ts'],
      consumes: ['src/lib/audit/layout-rules.ts'],
      deps: ['layout-spec-rules'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['surf-layout-plan'].deps = ['layout-derive-plan'];
    nodes['surf-layout-plan'].produces = [];
    nodes['surf-layout-plan'].validate = [{ type: 'expanded', minNodes: 2 }];
  }

  // Expand wrap-core (parallelized by command group)
  if (nodes['surf-cli-wrap-core']) {
    nodes['cli-wrap-protocol'] = {
      id: 'cli-wrap-protocol',
      desc: 'Wrap protocol ops: verify, explain',
      produces: ['src/cli/commands/protocol.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['cli-wrap-receipts'] = {
      id: 'cli-wrap-receipts',
      desc: 'Wrap receipt ops: list, show, filter',
      produces: ['src/cli/commands/receipts.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['cli-wrap-dag'] = {
      id: 'cli-wrap-dag',
      desc: 'Wrap DAG ops: show, diff, explain',
      produces: ['src/cli/commands/dag.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['surf-cli-wrap-core'].deps = ['cli-wrap-protocol', 'cli-wrap-receipts', 'cli-wrap-dag'];
    nodes['surf-cli-wrap-core'].produces = [];
    nodes['surf-cli-wrap-core'].validate = [{ type: 'expanded', minNodes: 3 }];
  }

  // Expand TS-input (sandbox + commands)
  if (nodes['surf-ts-input']) {
    nodes['ts-sandbox-allowlist'] = {
      id: 'ts-sandbox-allowlist',
      desc: 'Define and validate import allowlist for TS sandbox',
      produces: ['src/lib/ts-sandbox/allowlist.ts'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['ts-sandbox-runner'] = {
      id: 'ts-sandbox-runner',
      desc: 'Sandbox executor with allowlist enforcement',
      produces: ['src/lib/ts-sandbox.ts'],
      consumes: ['src/lib/ts-sandbox/allowlist.ts'],
      deps: ['ts-sandbox-allowlist'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['ts-cli-commands'] = {
      id: 'ts-cli-commands',
      desc: 'CLI: ts run --stdin, ts transform --stdin, ts typecheck --stdin',
      produces: ['src/cli/commands/ts.ts'],
      consumes: ['src/lib/ts-sandbox.ts'],
      deps: ['ts-sandbox-runner'],
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
    };
    nodes['surf-ts-input'].deps = ['ts-cli-commands'];
    nodes['surf-ts-input'].produces = [];
    nodes['surf-ts-input'].validate = [{ type: 'expanded', minNodes: 3 }];
  }

  // Now update downstream dependencies to point to the plan nodes (which will aggregate)
  // L2 nodes depend on the expanded parent nodes (which are now plan nodes)
  if (nodes['surf-audit-engine']) {
    nodes['surf-audit-engine'].deps = ['surf-audit-schema']; // unchanged, but now references plan node
  }
  if (nodes['surf-audit-cli']) {
    nodes['surf-audit-cli'].deps = ['surf-audit-schema', 'surf-audit-engine'];
  }

  return g;
}
