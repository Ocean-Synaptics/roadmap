// @module predicates
// @exports fileExists, gitArtifactExists, compound
// @types (none)
// @entry roadmap/protocol (re-exported)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Curried file-exists predicate for orient().
 * Usage: orient(g, fileExists('/path/to/repo'))
 */
export function fileExists(repoRoot: string): (artifact: string) => boolean {
  return (artifact: string) => existsSync(join(repoRoot, artifact));
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
