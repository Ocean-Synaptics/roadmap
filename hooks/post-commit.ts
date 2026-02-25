#!/usr/bin/env node
/**
 * Post-commit hook: write .regent/git-state.json
 *
 * Runs after every commit. Computes current git state and caches it for O(1) agent orientation.
 * Cost: subsumed in git (happens alongside git operations anyway).
 *
 * Install as: .git/hooks/post-commit (chmod +x)
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GitState } from '../src/git-state.schema.ts';

const repoRoot = process.cwd();
const stateDir = join(repoRoot, '.regent');
const statePath = join(stateDir, 'git-state.json');

try {
  // Get current branch
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

  // Get HEAD commit info
  const hashOutput = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const subjectOutput = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();

  // Check if working tree is clean
  const statusOutput = execSync('git status --porcelain', { encoding: 'utf-8' });
  const clean = statusOutput.trim() === '';

  // Parse dirty files
  const dirty = clean
    ? undefined
    : statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3).trim(),
          phase: null, // Could infer from roadmap.ts deps, but keep simple for now
          note: undefined,
        }));

  // Count commits since last checkpoint (for now, just total commits)
  const totalCommits = parseInt(
    execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim(),
    10
  );

  const state: GitState = {
    timestamp: Date.now(),
    branch,
    head: {
      hash: hashOutput,
      subject: subjectOutput,
      phase: null, // Could infer from commit message or roadmap node tags
      checkpoint: null,
    },
    clean,
    dirty,
    lastCheckpoint: null, // Could search for special checkpoint refs
    roadmapPosition: null, // Agent sets this after orient()
    dirtyCommits: totalCommits,
  };

  // Write cache
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
} catch (e) {
  // Silently fail post-commit hook to avoid blocking commits
  // (git best practice: hooks should not fail the operation)
  process.exit(0);
}
