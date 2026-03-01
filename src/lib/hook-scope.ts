// @module hook-scope
// @exports StagedOnlyFlag, getHookScope, getStagedFiles, assertStagedScope, filterStagedOnly, HookScope, StagedFile
// @entry roadmap

/**
 * Hook scoping: pre-commit validators must operate on staged files only (git diff --cached),
 * never the working tree. This prevents false positives on in-progress worker files
 * during parallel swarm execution (FR-PAR-002).
 *
 * Contract:
 * - Pre-commit hooks MUST use `git diff --cached` (not `git diff` or `git status`)
 * - Validator commands receive --staged flag to signal scoped execution
 * - Working-tree reads in hooks are a violation — assertStagedScope() catches them
 */

import { execSync } from 'node:child_process';

export type HookScope = 'staged' | 'working-tree';

/** Diff filter codes from git diff --diff-filter */
export type DiffFilter = 'A' | 'M' | 'D' | 'R' | 'C' | 'T';

export interface StagedFile {
  path: string;
  filter: DiffFilter;
}

export const StagedOnlyFlag = '--staged';

/**
 * Returns 'staged' — the required scope for pre-commit validators.
 * Hooks reading working-tree files risk false positives on in-progress worker changes.
 */
export function getHookScope(): HookScope {
  return 'staged';
}

/**
 * Get list of staged files from the git index (git diff --cached).
 * Only reads the index, never the working tree.
 */
export function getStagedFiles(cwd?: string, filter?: DiffFilter): StagedFile[] {
  const filterFlag = filter ? `--diff-filter=${filter}` : '';
  const cmd = `git diff --cached --name-status ${filterFlag}`.trim();
  const raw = execSync(cmd, { cwd: cwd ?? process.cwd(), encoding: 'utf-8' }).trim();
  if (!raw) return [];

  return raw.split('\n').map(line => {
    const [status, ...rest] = line.split('\t');
    return { path: rest.join('\t'), filter: status.charAt(0) as DiffFilter };
  });
}

/**
 * Filter a list of file paths to only those present in the staged index.
 * Use this to scope validator file lists to staged-only.
 */
export function filterStagedOnly(files: string[], cwd?: string): string[] {
  const staged = new Set(getStagedFiles(cwd).map(f => f.path));
  return files.filter(f => staged.has(f));
}

/** Guard: assert command uses staged scope. Throws if working-tree scope detected. */
export function assertStagedScope(command: string | string[]): void {
  const cmdStr = Array.isArray(command) ? command.join(' ') : command;
  if (cmdStr.includes('git diff') && !cmdStr.includes('--cached') && !cmdStr.includes('--staged')) {
    throw new Error(`hook-scope: command uses working-tree diff — use 'git diff --cached' instead: ${cmdStr}`);
  }
}
