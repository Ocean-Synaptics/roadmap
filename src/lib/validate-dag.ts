// @module validate-dag
// @exports validateTerminalIntentGate, findTerminalNodes, TerminalIntentError
// @entry roadmap

import type { Graph, ValidationRule } from '../protocol.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TerminalIntentError {
  type: 'missing-terminal-intent';
  node: string;
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
