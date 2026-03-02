// @module fixtures/state-builders
// @exports createAlignedState, createStaleState, createMultiCycleState, createMalformedState
// @types none (pure functions)
// @entry test-utils

import { TestRepo } from './test-repo-factory.ts';

/**
 * Fixture 1: Clean Aligned State
 *
 * Setup:
 * - git init + initial commit (SHA: ABC123)
 * - head.json with valid DAG spec
 * - git-state.json.lastCommit = ABC123 (matches current HEAD)
 * - recovery-state.json = null (not yet needed)
 *
 * Expected:
 * - detectMismatch().hasMismatch = false
 * - validateConsistency().consistent = true
 */
export function createAlignedState(repo: TestRepo): void {
  // Create initial head.json
  const headJson = {
    id: 'test-dag',
    desc: 'Test DAG for fixture',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'start',
        produces: ['seed.json'],
        consumes: [],
        deps: [],
      },
      term: {
        id: 'term',
        desc: 'end',
        produces: [],
        consumes: ['seed.json'],
        deps: ['init'],
      },
    },
  };

  repo.writeFile('.roadmap/head.json', JSON.stringify(headJson, null, 2));

  // Create initial commit
  const sha = repo.createCommit('Initial aligned state');

  // Create git-state.json pointing to current HEAD
  const gitState = {
    lastCommit: sha,
    timestamp: new Date().toISOString(),
    message: 'Initial aligned state',
  };

  repo.writeFile('.roadmap/git-state.json', JSON.stringify(gitState, null, 2));

  // Commit git-state.json
  repo.createCommit('Add git-state.json');
}

/**
 * Fixture 2: Stale Git State (mismatch trigger)
 *
 * Setup:
 * - Start with Fixture 1 (ABC123)
 * - Create new commit (SHA: DEF456)
 * - DON'T update git-state.json (still points to ABC123)
 *
 * Expected:
 * - detectMismatch().hasMismatch = true
 * - detectMismatch().headShaInFile = "ABC123"
 * - detectMismatch().actualGitSha = "DEF456"
 * - autoRecover() → git-state.json.lastCommit updated to DEF456
 * - validateConsistency().consistent = true after recovery
 */
export function createStaleState(repo: TestRepo): void {
  // Start with aligned state
  createAlignedState(repo);

  // Create a new commit WITHOUT updating git-state.json
  repo.writeFile('.roadmap/diverge.txt', 'divergence marker\n');
  repo.createCommit('Create divergence');

  // git-state.json still points to old commit (intentionally stale)
}

/**
 * Fixture 3: Multiple Recovery Cycles
 *
 * Setup:
 * - Start with Fixture 2 state (stale)
 * - Call recovery cycle N times
 * - Each cycle: new commit + auto-recovery
 *
 * Expected:
 * - recovery-state.json.mismatchCount increments
 * - recoveredAt timestamp updates each cycle
 * - prevGitState preserved from each cycle
 * - validateConsistency().consistent = true after each recovery
 */
export function createMultiCycleState(repo: TestRepo, cycles: number = 3): void {
  // Start with stale state
  createStaleState(repo);

  // Simulate recovery cycles
  for (let i = 0; i < cycles; i++) {
    // Create new commit
    repo.writeFile(`.roadmap/cycle-${i}.txt`, `cycle ${i} marker\n`);
    const newSha = repo.createCommit(`Cycle ${i}: create divergence`);

    // Auto-recovery: update git-state.json to current HEAD
    const gitState = {
      lastCommit: newSha,
      timestamp: new Date().toISOString(),
      message: `Cycle ${i}: recovered`,
    };
    repo.writeFile('.roadmap/git-state.json', JSON.stringify(gitState, null, 2));

    // Update recovery state
    const recoveryState = {
      lastHeadSha: 'prev-hash-' + i,
      lastGitState: 'prev-git-' + (i - 1),
      recoveredAt: new Date().toISOString(),
      mismatchCount: i + 1,
    };
    repo.writeFile('.roadmap/recovery-state.json', JSON.stringify(recoveryState, null, 2));

    // Commit recovery state
    repo.createCommit(`Cycle ${i}: recovery-state update`);
  }
}

/**
 * Fixture 4: Malformed State (recovery failure)
 *
 * Setup:
 * - head.json = invalid JSON (type: 'invalid-json')
 * - OR git-state.json references invalid commit (type: 'bad-commit')
 * - OR missing required fields in head.json (type: 'missing-field')
 *
 * Expected:
 * - validateConsistency().consistent = false
 * - validateConsistency().errors[] contains diagnostic messages
 * - autoRecover() fails gracefully with error field set
 */
export function createMalformedState(
  repo: TestRepo,
  type: 'invalid-json' | 'missing-field' | 'bad-commit' = 'invalid-json',
): void {
  // Start with aligned state
  createAlignedState(repo);

  switch (type) {
    case 'invalid-json': {
      // Write invalid JSON to head.json
      repo.writeFile('.roadmap/head.json', '{invalid json content}');
      repo.createCommit('Create malformed head.json');
      break;
    }

    case 'missing-field': {
      // Write head.json missing required fields
      const badHeadJson = {
        id: 'test-dag',
        // missing 'nodes' field
        desc: 'incomplete DAG',
      };
      repo.writeFile('.roadmap/head.json', JSON.stringify(badHeadJson, null, 2));
      repo.createCommit('Create head.json with missing fields');
      break;
    }

    case 'bad-commit': {
      // Write git-state.json with invalid commit SHA
      const badGitState = {
        lastCommit: 'invalid0000000000000000000000000000',
        timestamp: new Date().toISOString(),
        message: 'Invalid commit reference',
      };
      repo.writeFile('.roadmap/git-state.json', JSON.stringify(badGitState, null, 2));
      repo.createCommit('Create git-state.json with invalid commit');
      break;
    }
  }
}

/**
 * Fixture helper: Get fixture name for logging/reporting
 */
export function getFixtureName(type: 'aligned' | 'stale' | 'multi-cycle' | 'malformed'): string {
  const names: Record<string, string> = {
    aligned: 'Clean Aligned State',
    stale: 'Stale Git State (mismatch)',
    'multi-cycle': 'Multiple Recovery Cycles',
    malformed: 'Malformed State (recovery failure)',
  };
  return names[type] || 'Unknown Fixture';
}
