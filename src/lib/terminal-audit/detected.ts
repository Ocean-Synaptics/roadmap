// @module terminal-audit/detected
// @description Mechanically detect audit gaps — uncovered consumes, scope leaks, untested produces
// @exports DetectedGap, GapType, DetectionResult, detectGaps

import type { Graph, ValidationRule } from '../../protocol.ts';
import { consumeArtifact } from '../../protocol.ts';

// --- Types ---

export type GapType = 'uncovered-consume' | 'scope-leak' | 'untested-produce';

export interface DetectedGap {
  type: GapType;
  nodeId: string;
  artifact: string;
  detail: string;
}

export interface DetectionResult {
  gaps: DetectedGap[];
  summary: { uncoveredConsumes: number; scopeLeaks: number; untestedProduces: number; total: number };
}

// --- Implementation ---

/**
 * Detect gaps mechanically from DAG structure + filesystem state.
 *
 * Three detection passes:
 * 1. uncovered-consume: consumes[] entries not covered by any artifact-exists or shell validator
 *    across the DAG (i.e., no node validates that the consumed artifact actually exists)
 * 2. scope-leak: changed files that fall outside every node's produces[]
 * 3. untested-produce: produce files not referenced in any shell validator command
 *
 * @param dag - The graph being audited
 * @param changedFiles - Files changed in the working tree (e.g. from git diff)
 */
export function detectGaps(
  dag: Graph<string>,
  changedFiles: string[],
): DetectionResult {
  const gaps: DetectedGap[] = [];

  // Collect all produces and all validated artifacts across the DAG
  const allProduces = new Set<string>();
  const validatedArtifacts = new Set<string>();
  const shellCommands: string[] = [];

  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const p of node.produces ?? []) allProduces.add(p);

    for (const rule of node.validate ?? []) {
      collectValidatedArtifacts(rule, validatedArtifacts, shellCommands);
    }
  }

  // Pass 1: Uncovered consumes — consume not validated by artifact-exists anywhere
  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const consume of node.consumes ?? []) {
      const artifact = consumeArtifact(consume);
      if (!validatedArtifacts.has(artifact) && !isInitMarker(artifact)) {
        gaps.push({
          type: 'uncovered-consume',
          nodeId,
          artifact,
          detail: `consumes "${artifact}" but no node validates its existence via artifact-exists or shell`,
        });
      }
    }
  }

  // Pass 2: Scope leaks — changed files outside any produces[]
  for (const file of changedFiles) {
    if (!allProduces.has(file) && !isInfraFile(file)) {
      gaps.push({
        type: 'scope-leak',
        nodeId: '',
        artifact: file,
        detail: `changed file "${file}" is not in any node's produces[]`,
      });
    }
  }

  // Pass 3: Untested produces — produce files not referenced in any shell command
  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    for (const produce of node.produces ?? []) {
      if (!isReferencedByShell(produce, shellCommands) && !isInitMarker(produce)) {
        gaps.push({
          type: 'untested-produce',
          nodeId,
          artifact: produce,
          detail: `produces "${produce}" but no shell validator references it`,
        });
      }
    }
  }

  const uncoveredConsumes = gaps.filter(g => g.type === 'uncovered-consume').length;
  const scopeLeaks = gaps.filter(g => g.type === 'scope-leak').length;
  const untestedProduces = gaps.filter(g => g.type === 'untested-produce').length;

  return {
    gaps,
    summary: {
      uncoveredConsumes,
      scopeLeaks,
      untestedProduces,
      total: gaps.length,
    },
  };
}

// --- Helpers ---

/** Extract artifact paths validated by a rule + collect shell command strings */
function collectValidatedArtifacts(
  rule: ValidationRule,
  artifacts: Set<string>,
  shellCommands: string[],
): void {
  if (rule.type === 'artifact-exists') {
    const target = rule.target ?? rule.path;
    if (target) artifacts.add(target);
  } else if (rule.type === 'shell') {
    const cmd = 'argv' in rule ? rule.argv.join(' ') : String(rule.command);
    shellCommands.push(cmd);
  } else if (rule.type === 'build-produces') {
    shellCommands.push(rule.command);
  }
}

/** Init markers are synthetic — never flag them */
function isInitMarker(artifact: string): boolean {
  return artifact === 'init.marker' || artifact.endsWith('.marker');
}

/** Infrastructure files (.roadmap/*, .git/*, package.json, etc.) are not scope leaks */
function isInfraFile(file: string): boolean {
  return file.startsWith('.roadmap/') || file.startsWith('.git/') ||
    file === 'package.json' || file === 'package-lock.json' ||
    file === 'pnpm-lock.yaml' || file === 'tsconfig.json';
}

/** Check if a produce file is referenced (by path basename) in any shell command */
function isReferencedByShell(produce: string, shellCommands: string[]): boolean {
  // Match on the full path or the filename portion
  const basename = produce.split('/').pop() ?? produce;
  return shellCommands.some(cmd => cmd.includes(produce) || cmd.includes(basename));
}
