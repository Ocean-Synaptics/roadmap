// Roadmap query layer: read/write DAG state from git
// Enables git-native roadmap storage with O(1) retrieval

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { Graph } from '../src/protocol.ts';

/**
 * Read current HEAD DAG from .roadmap/head.json
 * Falls back to reconstructing from git history if needed
 */
export async function readHeadDAG(repoRoot: string = process.cwd()): Promise<Graph<string>> {
  const headPath = join(repoRoot, '.roadmap', 'head.json');

  try {
    const content = readFileSync(headPath, 'utf-8');
    const dag = JSON.parse(content);
    return dag as Graph<string>;
  } catch {
    // Cache miss or corrupted — reconstruct from git or return error
    return reconstructFromGitHistory(repoRoot);
  }
}

/**
 * Write DAG snapshot to .roadmap/head.json
 * Called when advancing to a new phase
 */
export function writeHeadDAG(repoRoot: string, dag: Graph<string>): void {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  writeFileSync(headPath, JSON.stringify(dag, null, 2));
}

/**
 * Query git history for DAG at specific commit
 * Returns DAG snapshot from that point in time
 */
export async function queryDAGAtCommit(
  repoRoot: string,
  commitHash: string,
): Promise<Graph<string> | null> {
  try {
    const content = execSync(`git show ${commitHash}:.roadmap/head.json`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    return JSON.parse(content) as Graph<string>;
  } catch {
    // Commit doesn't have this file, or git error
    return null;
  }
}

/**
 * Reconstruct current DAG from git history
 * Used as fallback if head.json is missing
 */
async function reconstructFromGitHistory(repoRoot: string): Promise<Graph<string>> {
  try {
    // Get most recent commit that modified .roadmap/head.json
    const lastCommit = execSync(
      'git log --oneline -1 -- .roadmap/head.json',
      { cwd: repoRoot, encoding: 'utf-8' },
    )
      .trim()
      .split(' ')[0];

    if (!lastCommit) {
      throw new Error('No roadmap history found');
    }

    return (await queryDAGAtCommit(repoRoot, lastCommit)) || ({} as Graph<string>);
  } catch (e) {
    throw new Error(
      `Cannot reconstruct roadmap from git history: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Advance roadmap: move to next node, commit changes
 * Called by agents after completing current node
 */
export async function advance(
  repoRoot: string,
  nextDAG: Graph<string>,
  reason: string,
): Promise<{ commitHash: string; nextNode: string }> {
  try {
    // Write new DAG
    writeHeadDAG(repoRoot, nextDAG);

    // Commit
    execSync(`git add .roadmap/head.json`, { cwd: repoRoot, stdio: 'ignore' });
    execSync(`git commit -m "roadmap: advance — ${reason}"`, {
      cwd: repoRoot,
      stdio: 'ignore',
    });

    // Get commit hash
    const commitHash = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();

    // Find next node (first node in remaining)
    const nodes = Object.keys(nextDAG.nodes);
    const nextNode = nodes.find(n => n !== nextDAG.term) || nextDAG.term;

    return { commitHash, nextNode };
  } catch (e) {
    throw new Error(
      `Roadmap advance failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * List all roadmap checkpoints (commits that advanced roadmap)
 * Enables time-travel and audit trail
 */
export async function listCheckpoints(repoRoot: string): Promise<
  Array<{
    commitHash: string;
    timestamp: number;
    subject: string;
    dag: Graph<string>;
  }>
> {
  try {
    const log = execSync(
      'git log --pretty=format:"%H|%cI|%s" -- .roadmap/head.json',
      { cwd: repoRoot, encoding: 'utf-8' },
    );

    const checkpoints = [];
    for (const line of log.split('\n').filter(Boolean)) {
      const [hash, isoTime, subject] = line.split('|');
      const dag = await queryDAGAtCommit(repoRoot, hash);

      if (dag) {
        checkpoints.push({
          commitHash: hash,
          timestamp: new Date(isoTime).getTime(),
          subject,
          dag,
        });
      }
    }

    return checkpoints;
  } catch {
    return [];
  }
}

/**
 * Generate reconciliation manifest from current DAG
 * What adopting agents need to know
 */
export async function getReconciliationManifest(
  repoRoot: string,
): Promise<{
  graph: Graph<string>;
  position: string;
  produces: string[];
  consumes: string[];
  remaining: number;
  roadmapHash: string;
}> {
  const dag = await readHeadDAG(repoRoot);
  const { orient } = await import('../src/protocol.ts');

  // Simple position: first non-terminal node with missing produces
  const fsCheck = (a: string) => {
    try {
      const { existsSync } = require('node:fs');
      return existsSync(join(repoRoot, a));
    } catch {
      return false;
    }
  };

  const pos = orient(dag, fsCheck);

  // Compute DAG hash for versioning
  const dagHash = execSync('git hash-object -t blob .roadmap/head.json', {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();

  return {
    graph: dag,
    position: pos.position,
    produces: pos.produces,
    consumes: pos.consumes,
    remaining: pos.remaining.length,
    roadmapHash: dagHash,
  };
}
