// @module enforcement
// @exports WorktreeCleanup, WorktreeEntry, CleanupResult, CleanupReport
// @types WorktreeEntry, CleanupResult, CleanupReport
// @entry roadmap

import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Worktree entry: metadata for a single git worktree
 */
export interface WorktreeEntry {
  path: string;
  worktreeDir: string;
  gitDir: string;
  branch?: string;
  found: boolean;
  stale: boolean; // not modified in 7+ days
  orphaned: boolean; // worktree exists, git branch doesn't
  mtime: number; // modification time
  reason?: string;
}

/**
 * Result of a single worktree cleanup operation
 */
export interface CleanupResult {
  path: string;
  success: boolean;
  reason: string;
  error?: string;
}

/**
 * Full cleanup report
 */
export interface CleanupReport {
  timestamp: string;
  worktreeRoot: string;
  scannedCount: number;
  staleCount: number;
  orphanedCount: number;
  cleanedCount: number;
  failedCount: number;
  entries: WorktreeEntry[];
  results: CleanupResult[];
  summary: string;
}

/**
 * WorktreeCleanup: detect and remove stale/orphaned git worktrees
 */
export class WorktreeCleanup {
  private worktreeRoot: string;
  private staleDays = 7;

  constructor(worktreeRoot: string = join(process.env.HOME || '/root', '.claude/worktrees')) {
    this.worktreeRoot = worktreeRoot;
  }

  /**
   * Scan .claude/worktrees/ and detect stale/orphaned entries
   */
  scan(): WorktreeEntry[] {
    const entries: WorktreeEntry[] = [];

    if (!existsSync(this.worktreeRoot)) {
      return entries;
    }

    const items = readdirSync(this.worktreeRoot);

    for (const item of items) {
      const itemPath = join(this.worktreeRoot, item);
      const stat = statSync(itemPath);

      if (!stat.isDirectory()) {
        continue;
      }

      const entry: WorktreeEntry = {
        path: itemPath,
        worktreeDir: itemPath,
        gitDir: join(itemPath, '.git'),
        found: existsSync(itemPath),
        stale: false,
        orphaned: false,
        mtime: stat.mtimeMs,
        branch: undefined,
      };

      // Check if stale (not modified in 7+ days)
      const ageMs = Date.now() - stat.mtimeMs;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays >= this.staleDays) {
        entry.stale = true;
        entry.reason = `stale: not modified for ${Math.floor(ageDays)} days`;
      }

      // Check if orphaned: worktree exists but branch is gone
      if (existsSync(join(itemPath, '.git'))) {
        try {
          const branch = this.getBranchForWorktree(itemPath);
          entry.branch = branch;

          if (!this.branchExists(branch)) {
            entry.orphaned = true;
            entry.reason = `orphaned: branch '${branch}' does not exist in main repo`;
          }
        } catch (e) {
          entry.orphaned = true;
          entry.reason = `orphaned: unable to determine branch (${(e as Error).message})`;
        }
      }

      entries.push(entry);
    }

    return entries;
  }

  /**
   * Get the branch name for a worktree
   */
  private getBranchForWorktree(worktreePath: string): string {
    try {
      // Read .git/HEAD to find the current branch
      const headFile = join(worktreePath, '.git', 'HEAD');
      if (existsSync(headFile)) {
        const content = require('node:fs').readFileSync(headFile, 'utf-8').trim();
        const match = content.match(/ref: refs\/heads\/(.+)/);
        if (match) {
          return match[1];
        }
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Check if a branch exists in the main repository
   */
  private branchExists(branch: string): boolean {
    if (branch === 'unknown') {
      return false;
    }

    try {
      // Check if the branch ref exists in .git/refs/heads or packed-refs
      execSync(`git rev-parse --verify refs/heads/${branch} 2>/dev/null`, {
        cwd: this.worktreeRoot,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up identified stale/orphaned worktrees
   * Returns list of cleaned paths and reasons
   */
  clean(dryRun = false): CleanupResult[] {
    const entries = this.scan();
    const results: CleanupResult[] = [];

    for (const entry of entries) {
      if (entry.stale || entry.orphaned) {
        const reason = entry.reason || (entry.stale ? 'stale' : 'orphaned');

        if (dryRun) {
          results.push({
            path: entry.path,
            success: true,
            reason: `[dry-run] would remove ${reason}`,
          });
        } else {
          try {
            rmSync(entry.path, { recursive: true, force: true });
            results.push({
              path: entry.path,
              success: true,
              reason: `removed: ${reason}`,
            });
          } catch (e) {
            results.push({
              path: entry.path,
              success: false,
              reason: `failed to remove: ${reason}`,
              error: (e as Error).message,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Generate cleanup report
   */
  report(includeResults = true): CleanupReport {
    const entries = this.scan();
    const results = includeResults ? this.clean(true) : [];

    const staleCount = entries.filter(e => e.stale).length;
    const orphanedCount = entries.filter(e => e.orphaned).length;
    const cleanedCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    const summary =
      staleCount > 0 || orphanedCount > 0
        ? `${staleCount} stale, ${orphanedCount} orphaned worktrees found`
        : 'No stale or orphaned worktrees';

    return {
      timestamp: new Date().toISOString(),
      worktreeRoot: this.worktreeRoot,
      scannedCount: entries.length,
      staleCount,
      orphanedCount,
      cleanedCount,
      failedCount,
      entries,
      results,
      summary,
    };
  }
}
