/**
 * Multi-repo dependency discovery + transitive ordering
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { DependencySpec } from '../project-metadata.schema.ts';

/**
 * Resolve the filesystem path for a dependency spec.
 * Priority: ROADMAP_SIBLING_ROOT env > dep.siblingPath > dep.repo relative to repoRoot parent.
 */
export function resolveSiblingPath(repoRoot: string, dep: DependencySpec): string {
  const envRoot = process.env.ROADMAP_SIBLING_ROOT;
  if (envRoot) return resolve(envRoot, dep.repo.replace(/^\.\.\//, ''));
  if (dep.siblingPath) return resolve(repoRoot, dep.siblingPath);
  return resolve(repoRoot, dep.repo);
}

export async function discoverDependencies(repoRoot: string): Promise<DependencySpec[]> {
  try {
    const metaPath = join(repoRoot, '.roadmap.json');
    const metaContent = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    return meta.dependencies || [];
  } catch {
    return [];
  }
}

export interface RepoDepGraph {
  readonly repos: Map<string, string[]>;  // repo path → dep repo paths
  readonly specs: Map<string, DependencySpec[]>;  // repo path → its dep specs
}

/**
 * Build the full transitive dependency graph starting from a root repo.
 * BFS: reads each repo's .roadmap.json, discovers its deps, enqueues them.
 */
export async function buildDepGraph(repoRoot: string): Promise<RepoDepGraph> {
  const repos = new Map<string, string[]>();
  const specs = new Map<string, DependencySpec[]>();
  const queue = [resolve(repoRoot)];

  while (queue.length) {
    const current = queue.shift()!;
    if (repos.has(current)) continue;

    const deps = await discoverDependencies(current);
    const depPaths = deps
      .map(d => resolveSiblingPath(current, d))
      .filter(p => existsSync(p));

    repos.set(current, depPaths);
    specs.set(current, deps);

    for (const dp of depPaths) {
      if (!repos.has(dp)) queue.push(dp);
    }
  }

  return { repos, specs };
}

/**
 * Topological sort of repos by dependency order. Detects cycles.
 * Returns repos in build order (dependencies first).
 */
export async function orderByDependencies(repoRoot: string): Promise<string[]> {
  const { repos } = await buildDepGraph(repoRoot);

  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(repo: string): void {
    if (visited.has(repo)) return;
    if (visiting.has(repo)) throw new Error(`Circular repo dependency: ${repo}`);

    visiting.add(repo);
    for (const dep of repos.get(repo) || []) {
      visit(dep);
    }
    visiting.delete(repo);
    visited.add(repo);
    order.push(repo);
  }

  for (const repo of repos.keys()) {
    visit(repo);
  }

  return order;
}
