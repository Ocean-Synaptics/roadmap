/**
 * Cross-repo orientation: check local DAG position + sibling repo dependency status.
 * Async — parallelizes sibling repo checks.
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { orient } from '../protocol.ts';
import type { Orientation, Graph } from '../protocol.ts';
import { fileExists } from '../predicates.ts';
import { discoverDependencies, resolveSiblingPath } from './dependency-resolver.ts';
import type { DependencySpec } from './project-metadata.schema.ts';

export interface SiblingStatus {
  readonly repo: string;                          // repo name (basename of path)
  readonly path: string;                          // resolved filesystem path
  readonly position: string[] | 'unknown' | 'untracked'; // sibling's orient position (batch, or sentinel)
  readonly satisfied: boolean;                    // all consumes available?
  readonly waiting: string[];                     // consumes not yet produced
  readonly repoExists: boolean;                   // does the sibling path exist?
  readonly dagExists: boolean;                    // does sibling have .roadmap/head.json?
}

export interface CrossOrientation extends Orientation {
  readonly blockedBy: SiblingStatus[];
  readonly deps: SiblingStatus[];
}

/**
 * Load a DAG from a repo's .roadmap/head.json.
 * Returns null if missing or unparseable.
 */
async function loadSiblingDAG(repoRoot: string): Promise<Graph<string> | null> {
  try {
    const content = await readFile(resolve(repoRoot, '.roadmap/head.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Check a single sibling repo's status relative to our dependency on it.
 */
async function checkSibling(localRoot: string, dep: DependencySpec): Promise<SiblingStatus> {
  const sibPath = resolveSiblingPath(localRoot, dep);
  const repoName = basename(sibPath);

  if (!existsSync(sibPath)) {
    return {
      repo: repoName, path: sibPath, position: 'unknown',
      satisfied: false, waiting: [...dep.consumes], repoExists: false, dagExists: false,
    };
  }

  const sibExists = fileExists(sibPath);
  const waiting = dep.consumes.filter(c => !sibExists(c));

  const dag = await loadSiblingDAG(sibPath);
  let position: string[] | 'unknown' | 'untracked' = 'untracked';
  if (dag) {
    const sibOrientation = orient(dag, sibExists);
    position = sibOrientation.position;
  }

  return {
    repo: repoName, path: sibPath, position,
    satisfied: waiting.length === 0, waiting,
    repoExists: true, dagExists: dag !== null,
  };
}

/**
 * Cross-repo orient: local orient + parallel sibling dependency checks.
 * Returns standard Orientation with additional blockedBy/deps fields.
 */
export async function crossOrient<T extends string>(
  g: Graph<T>,
  repoRoot: string,
  exists?: (artifact: string) => boolean,
  retired?: ReadonlySet<string>,
): Promise<CrossOrientation> {
  const predicate = exists || fileExists(repoRoot);
  const local = orient(g, predicate, retired);

  const deps = await discoverDependencies(repoRoot);
  if (!deps.length) {
    return { ...local, blockedBy: [], deps: [] };
  }

  const siblingStatuses = await Promise.all(
    deps.map(d => checkSibling(repoRoot, d))
  );

  const blockedBy = siblingStatuses.filter(s =>
    !s.satisfied && deps.find(d => basename(resolveSiblingPath(repoRoot, d)) === s.repo)?.mustComplete
  );

  return { ...local, blockedBy, deps: siblingStatuses };
}
