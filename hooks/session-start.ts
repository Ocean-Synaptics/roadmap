#!/usr/bin/env node
/**
 * Session-start hook: initialize or refresh git-state.json
 *
 * Runs at agent session start (before orient()).
 * If cache is fresh (<10s old), uses it. Otherwise computes fresh state.
 *
 * Call as: await runSessionStartHook(repoRoot)
 */

import { readGitState, isFresh } from '../src/git-state.schema.ts';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GitState } from '../src/git-state.schema.ts';

export async function runSessionStartHook(repoRoot: string): Promise<GitState> {
  // Try to read cached state
  const cached = await readGitState(repoRoot);

  // If fresh, use it
  if (cached && isFresh(cached)) {
    return cached;
  }

  // Otherwise, compute fresh state (same as post-commit)
  const branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();

  const hashOutput = execSync('git rev-parse HEAD', {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();

  const subjectOutput = execSync('git log -1 --pretty=%s', {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();

  const statusOutput = execSync('git status --porcelain', {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  const clean = statusOutput.trim() === '';

  const dirty = clean
    ? undefined
    : statusOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3).trim(),
          phase: null,
          note: undefined,
        }));

  const totalCommits = parseInt(
    execSync('git rev-list --count HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim(),
    10
  );

  const state: GitState = {
    timestamp: Date.now(),
    branch,
    head: {
      hash: hashOutput,
      subject: subjectOutput,
      phase: null,
      checkpoint: null,
    },
    clean,
    dirty,
    lastCheckpoint: null,
    roadmapPosition: null,
    dirtyCommits: totalCommits,
  };

  // Write cache
  const stateDir = join(repoRoot, '.regent');
  const statePath = join(stateDir, 'git-state.json');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));

  return state;
}

// If run as script, execute hook
if (import.meta.url === `file://${process.argv[1]}`) {
  runSessionStartHook(process.cwd())
    .then(state => {
      console.log(`✓ Git state cached (${state.branch}@${state.head.hash.slice(0, 7)})`);
    })
    .catch(e => {
      console.error('Session-start hook failed:', e.message);
      process.exit(1);
    });
}

export default runSessionStartHook;
