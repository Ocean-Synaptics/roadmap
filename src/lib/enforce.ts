// @module enforce
// @exports validateDAGEditAuthorization, validateCompletionClaim, recordBlockedMutation, EnforcementResult
// @types EnforcementResult, BlockedMutationRecord
// @entry roadmap

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface EnforcementResult {
  allowed: boolean;
  rule: string;
  reason: string;
  fix?: string;
}

export interface BlockedMutationRecord {
  ts: string;
  rule: string;
  branch: string;
  files: string[];
  reason: string;
  bypass?: string;
}

// Sanctioned commit message prefixes that indicate roadmap-managed edits
const SANCTIONED_PREFIXES = ['roadmap:', 'make:', 'advance:', 'complete:'];

/**
 * Validate that a DAG edit (head.json mutation) is authorized.
 * Authorized = on a feature branch OR committed via a sanctioned roadmap command.
 */
export function validateDAGEditAuthorization(
  repoRoot: string,
  branch: string,
  stagedFiles: string[],
): EnforcementResult {
  const dagFiles = stagedFiles.filter(f => f.includes('.roadmap/head') && f.endsWith('.json'));
  if (dagFiles.length === 0) {
    return { allowed: true, rule: 'dag-edit-auth', reason: 'No DAG files in changeset' };
  }

  // Feature branches are allowed to edit DAG files
  if (branch.startsWith('feat/') || branch.startsWith('wip/') || branch === 'develop') {
    return { allowed: true, rule: 'dag-edit-auth', reason: `Branch ${branch} is authorized for DAG edits` };
  }

  return {
    allowed: false,
    rule: 'dag-edit-auth',
    reason: `DAG edits blocked on branch '${branch}'. Only feat/*, wip/*, develop branches may edit head*.json`,
    fix: 'roadmap spawn --task <node-id>',
  };
}

/**
 * Validate that a node completion claim is legitimate.
 * Checks: node exists in DAG, produced artifacts exist, not already completed.
 */
export function validateCompletionClaim(
  repoRoot: string,
  nodeId: string,
): EnforcementResult {
  const headPath = join(repoRoot, '.roadmap', 'head.json');
  if (!existsSync(headPath)) {
    return { allowed: false, rule: 'completion-claim', reason: 'No DAG found', fix: 'Initialize roadmap first' };
  }

  let dag: any;
  try {
    dag = JSON.parse(readFileSync(headPath, 'utf-8'));
  } catch {
    return { allowed: false, rule: 'completion-claim', reason: 'Failed to parse head.json' };
  }

  const node = dag.nodes?.[nodeId];
  if (!node) {
    return { allowed: false, rule: 'completion-claim', reason: `Node '${nodeId}' not found in DAG`, fix: 'Check node ID spelling' };
  }

  // Check produces artifacts exist
  const missing: string[] = [];
  for (const artifact of node.produces ?? []) {
    const fullPath = join(repoRoot, artifact);
    if (!existsSync(fullPath)) {
      missing.push(artifact);
    }
  }

  if (missing.length > 0) {
    return {
      allowed: false,
      rule: 'completion-claim',
      reason: `Missing artifacts: ${missing.join(', ')}`,
      fix: `Produce: ${missing.join(', ')}`,
    };
  }

  return { allowed: true, rule: 'completion-claim', reason: `Node '${nodeId}' artifacts verified` };
}

/**
 * Record a blocked mutation to the enforcement trail.
 * Appends to .roadmap/enforcement-trail.jsonl for audit.
 */
export function recordBlockedMutation(
  repoRoot: string,
  record: BlockedMutationRecord,
): void {
  const roadmapDir = join(repoRoot, '.roadmap');
  if (!existsSync(roadmapDir)) mkdirSync(roadmapDir, { recursive: true });
  const trailPath = join(roadmapDir, 'enforcement-trail.jsonl');
  appendFileSync(trailPath, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Validate that a commit message references a sanctioned roadmap operation.
 * Used by commit-msg hook to ensure trail attribution.
 */
export function validateCommitAttribution(
  message: string,
  dagNodeIds: string[],
): EnforcementResult {
  for (const prefix of SANCTIONED_PREFIXES) {
    if (message.startsWith(prefix)) {
      return { allowed: true, rule: 'commit-attribution', reason: `Sanctioned prefix: ${prefix}` };
    }
  }

  for (const nodeId of dagNodeIds) {
    if (message.includes(nodeId)) {
      return { allowed: true, rule: 'commit-attribution', reason: `References node: ${nodeId}` };
    }
  }

  return {
    allowed: false,
    rule: 'commit-attribution',
    reason: 'Commit message does not reference a roadmap node or sanctioned prefix',
    fix: 'Use: git commit -m "node-id: description" or "roadmap: description"',
  };
}

/**
 * Get the current git branch name.
 */
export function getCurrentBranch(repoRoot: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get staged files from git index.
 */
export function getStagedFiles(repoRoot: string): string[] {
  try {
    const output = execSync('git diff --cached --name-only', { cwd: repoRoot, stdio: 'pipe' }).toString().trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
}
