// @module predicates
// @exports fileExists, gitArtifactExists, gitArtifactAt, siblingArtifactExists, compound, any
// @types (none)
// @entry roadmap/protocol (re-exported)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Curried file-exists predicate for orient().
 * Usage: orient(g, fileExists('/path/to/repo'))
 * Handles ~ paths as absolute home-relative paths.
 */
export function fileExists(repoRoot: string): (artifact: string) => boolean {
  return (artifact: string) => {
    const path = artifact.startsWith('~')
      ? artifact.replace('~', homedir())
      : join(repoRoot, artifact);
    return existsSync(path);
  };
}

/**
 * Curried git-tracked artifact predicate.
 * Returns true if artifact exists in the git index (tracked, not just on disk).
 * Useful for repos where untracked files shouldn't count as "produced".
 */
export function gitArtifactExists(repoRoot: string): (artifact: string) => boolean {
  return (artifact: string) => {
    try {
      execSync(`git ls-files --error-unmatch ${artifact}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Curried predicate: artifact exists at a specific git ref.
 * Usage: orient(g, gitArtifactAt(root, 'HEAD~3')) — check archived state.
 */
export function gitArtifactAt(repoRoot: string, ref: string): (artifact: string) => boolean {
  return (artifact: string) => {
    try {
      execSync(`git cat-file -e ${ref}:${artifact}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * Curried predicate: artifact exists in a sibling repo's working tree.
 * The sibling path is resolved relative to the calling repo's parent.
 * Usage: orient(g, siblingArtifactExists('/abs/path/to/sibling'))
 */
export function siblingArtifactExists(siblingRoot: string): (artifact: string) => boolean {
  return fileExists(siblingRoot);
}

/**
 * Compose multiple predicates with AND logic.
 * All predicates must return true for the artifact to count as existing.
 * Usage: orient(g, compound(fileExists(root), gitArtifactExists(root)))
 */
export function compound(
  ...predicates: Array<(artifact: string) => boolean>
): (artifact: string) => boolean {
  if (!predicates.length) throw new Error('compound() requires at least one predicate');
  return (artifact: string) => predicates.every(p => p(artifact));
}

/**
 * Compose multiple predicates with OR logic.
 * At least one predicate must return true.
 * Usage: orient(g, any(fileExists(root), siblingArtifactExists('../sibling')))
 */
export function any(
  ...predicates: Array<(artifact: string) => boolean>
): (artifact: string) => boolean {
  if (!predicates.length) throw new Error('any() requires at least one predicate');
  return (artifact: string) => predicates.some(p => p(artifact));
}
