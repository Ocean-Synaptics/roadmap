// @module validate-dag
// @exports validateTerminalIntentGate, validateInitIntentGate, validateStackedTermGates, findTerminalNodes, TerminalIntentError, InitIntentError, StackedTermGateError
// @entry roadmap

import type { Graph, ValidationRule, TermGate } from '../protocol.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TerminalIntentError {
  type: 'missing-terminal-intent';
  node: string;
  message: string;
  fix: string;
}

export interface InitIntentError {
  type: 'missing-init-intent' | 'init-gate-no-expand-on-fail';
  node: string;
  message: string;
  fix: string;
}

export interface StackedTermGateError {
  type: 'invalid-stacked-gates' | 'gate-missing-checks';
  gates?: TermGate[];
  message: string;
  fix: string;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Find terminal nodes in a DAG — nodes with no dependents (no other node lists them as a dep).
 * In practice, the graph's `term` field is the canonical terminal, but multiple nodes may
 * have no downstream dependents (e.g. in expanded DAGs).
 */
export function findTerminalNodes<T extends string>(g: Graph<T>): string[] {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  const hasDependents = new Set<string>();
  for (const n of nodes) {
    for (const dep of n.deps) {
      hasDependents.add(dep);
    }
  }
  return nodes.filter(n => !hasDependents.has(n.id)).map(n => n.id);
}

/**
 * Find the init boundary — the first execute node(s) that depend directly on init.
 * Returns the node IDs of the init-adjacent layer.
 */
export function findInitBoundary<T extends string>(g: Graph<T>): string[] {
  const nodes = Object.values(g.nodes) as Array<{ id: string; deps: readonly string[] }>;
  return nodes
    .filter(n => n.deps.includes(g.init as string))
    .map(n => n.id)
    .sort();
}

/**
 * Validate that every terminal node in the DAG has at least one intent rule with expandOnFail: true.
 * This is the terminal intent gate invariant from FR-INTENT-EXPANSION.
 *
 * Called from: cmdExpand, cmdImport, cmdValidate.
 */
export function validateTerminalIntentGate<T extends string>(g: Graph<T>): TerminalIntentError | null {
  const terminals = findTerminalNodes(g);

  for (const termId of terminals) {
    const node = (g.nodes as Record<string, { validate: readonly ValidationRule[] }>)[termId];
    if (!node) continue;

    const hasIntentGate = node.validate?.some(
      (r: ValidationRule) => r.type === 'intent' && (r as any).expandOnFail === true
    );

    if (!hasIntentGate) {
      return {
        type: 'missing-terminal-intent',
        node: termId,
        message: `Terminal node '${termId}' requires at least one intent rule with expandOnFail: true`,
        fix: 'Add an intent gate that describes what "done" looks like for this roadmap',
      };
    }
  }

  return null;
}

/**
 * Validate that at least one node in the init boundary has an intent rule with expandOnFail: true.
 * The intent statement must mention "plan", "clarity", or "unambiguous" to ensure clarity on start.
 * This is the init intent gate invariant — bookend pairing with terminal gate.
 *
 * Called from: cmdExpand, cmdImport, cmdValidate.
 */
export function validateInitIntentGate<T extends string>(g: Graph<T>): InitIntentError | null {
  const initBoundary = findInitBoundary(g);

  if (initBoundary.length === 0) {
    return {
      type: 'missing-init-intent',
      node: g.init as string,
      message: `DAG missing init boundary — no nodes depend directly on init`,
      fix: 'Add at least one node that depends on init and includes an intent gate',
    };
  }

  for (const nodeId of initBoundary) {
    const node = (g.nodes as Record<string, { validate: readonly ValidationRule[] }>)[nodeId];
    if (!node) continue;

    const intentRule = node.validate?.find(
      (r: ValidationRule) => r.type === 'intent'
    ) as any;

    if (intentRule) {
      const statement = (intentRule.statement ?? '').toLowerCase();
      const hasContextKeyword = /plan|clarity|unambiguous/.test(statement);

      if (!intentRule.expandOnFail) {
        return {
          type: 'init-gate-no-expand-on-fail',
          node: nodeId,
          message: `Init boundary node '${nodeId}' intent rule must have expandOnFail: true`,
          fix: 'Set expandOnFail: true on the intent rule to enable expansion when clarity is uncertain',
        };
      }

      if (hasContextKeyword) {
        return null;
      }
    }
  }

  return {
    type: 'missing-init-intent',
    node: initBoundary[0],
    message: `Init boundary node '${initBoundary[0]}' requires an intent rule with expandOnFail: true and mention of plan/clarity/unambiguous`,
    fix: 'Add an intent gate on an init-adjacent node with a statement mentioning planning or clarity',
  };
}

/**
 * Validate stacked term gates (council of reviewers architecture)
 * Each gate must have checks and a clear reviewer role
 */
export function validateStackedTermGates(gates: readonly TermGate[] | undefined): StackedTermGateError | null {
  if (!gates || gates.length === 0) {
    return null;  // Optional feature, not an error
  }

  const reviewerRoles = new Set<string>();

  for (const gate of gates) {
    // Check: each gate has a unique reviewer
    if (reviewerRoles.has(gate.reviewer)) {
      return {
        type: 'invalid-stacked-gates',
        gates: gates as TermGate[],
        message: `Duplicate reviewer role: '${gate.reviewer}' appears in multiple term gates`,
        fix: 'Each term gate should have a distinct reviewer role (e.g., "Visual Engineer", "Feature Engineer")',
      };
    }
    reviewerRoles.add(gate.reviewer);

    // Check: each gate has checks
    if (!gate.checks || gate.checks.length === 0) {
      return {
        type: 'gate-missing-checks',
        gates: gates as TermGate[],
        message: `Term gate '${gate.id}' (${gate.reviewer}) has no validation checks`,
        fix: `Add validation rules to the '${gate.id}' gate that verify "${gate.validates}"`,
      };
    }
  }

  return null;
}
