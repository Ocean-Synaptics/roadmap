#!/usr/bin/env node
/**
 * Session-start hook: initialize git-state if missing.
 * Runs at session start to ensure git-state.json exists, enabling recovery.
 */

import fs from 'fs';
import path from 'path';
import { createGitState, recordArtifact } from '../src/git-state.schema';
import { execSync } from 'child_process';

const ROADMAP_DIR = '.roadmap';
const GIT_STATE_FILE = path.join(ROADMAP_DIR, 'git-state.json');

/**
 * Get current git commit hash.
 */
function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get all artifact paths from head.json.
 */
function getArtifactPaths(): string[] {
  try {
    const headPath = path.join(ROADMAP_DIR, 'head.json');
    if (!fs.existsSync(headPath)) return [];

    const head = JSON.parse(fs.readFileSync(headPath, 'utf-8'));
    const artifacts = new Set<string>();

    for (const node of Object.values(head.nodes || {})) {
      const n = node as any;
      if (n.produces) {
        for (const p of n.produces) {
          artifacts.add(p);
        }
      }
    }

    return Array.from(artifacts);
  } catch {
    return [];
  }
}

/**
 * Check if artifact exists in working tree.
 */
function artifactExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Main hook logic.
 */
function main() {
  // Only run if .roadmap exists
  if (!fs.existsSync(ROADMAP_DIR)) {
    return;
  }

  try {
    // Create git-state if missing
    if (!fs.existsSync(GIT_STATE_FILE)) {
      let state = createGitState();
      const commit = getCurrentCommit();

      // Record all existing artifacts at session start
      const artifacts = getArtifactPaths();
      for (const artifact of artifacts) {
        if (artifactExists(artifact)) {
          state = recordArtifact(state, artifact, commit);
        }
      }

      // Ensure directory exists
      if (!fs.existsSync(ROADMAP_DIR)) {
        fs.mkdirSync(ROADMAP_DIR, { recursive: true });
      }

      fs.writeFileSync(GIT_STATE_FILE, JSON.stringify(state, null, 2));
    }
  } catch (err) {
    // Silently fail on errors, don't block session start
    // Log to stderr if needed
    if (process.env.DEBUG) {
      console.error('session-start hook failed:', err);
    }
  }
}

main();
