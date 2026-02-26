#!/usr/bin/env node
/**
 * Post-commit hook: write git-state metadata.
 * Records which artifacts exist after each commit, enabling recovery via gitArtifactAt().
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createGitState, recordArtifact } from '../src/git-state.schema';

const ROADMAP_DIR = '.roadmap';
const GIT_STATE_FILE = path.join(ROADMAP_DIR, 'git-state.json');

/**
 * Get current git commit hash.
 */
function getCurrentCommit(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    console.error('Failed to get current commit hash');
    process.exit(1);
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

    // Collect all produces from all nodes
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
    return; // No roadmap in this project
  }

  try {
    // Load or create git-state
    let state = createGitState();
    if (fs.existsSync(GIT_STATE_FILE)) {
      try {
        state = JSON.parse(fs.readFileSync(GIT_STATE_FILE, 'utf-8'));
      } catch {
        // Invalid file, overwrite with fresh state
        state = createGitState();
      }
    }

    // Get current commit
    const commit = getCurrentCommit();

    // Record all existing artifacts
    const artifacts = getArtifactPaths();
    for (const artifact of artifacts) {
      if (artifactExists(artifact)) {
        state = recordArtifact(state, artifact, commit);
      }
    }

    // Write updated state
    if (!fs.existsSync(ROADMAP_DIR)) {
      fs.mkdirSync(ROADMAP_DIR, { recursive: true });
    }
    fs.writeFileSync(GIT_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('post-commit hook failed:', err);
    // Don't fail the commit for hook errors
  }
}

main();
