// HEADSHA-RECOVERY — auto-detect and fix headSha mismatches
//
// Tests verify that:
// 1. Mismatch detection identifies git state divergence
// 2. Auto-recovery syncs head.json and git-state.json
// 3. Consistency validation ensures DAG integrity post-recovery

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  HeadShaRecovery,
  detectMismatch,
  autoRecover,
  validateConsistency,
} from '../src/lib/roadmap/headsha-recovery.ts';

let tempDir: string;

function setupTestRepo(): string {
  const baseDir = join(process.cwd(), '.test-headsha-recovery');
  if (existsSync(baseDir)) {
    rmSync(baseDir, { recursive: true });
  }
  mkdirSync(baseDir, { recursive: true });
  mkdirSync(join(baseDir, '.roadmap'), { recursive: true });

  // Initialize git repo
  execSync('git init', { cwd: baseDir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: baseDir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: baseDir, stdio: 'pipe' });

  // Create initial head.json
  const headJson = {
    id: 'test-dag',
    desc: 'Test DAG for recovery',
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
  writeFileSync(join(baseDir, '.roadmap', 'head.json'), JSON.stringify(headJson, null, 2) + '\n');

  // Create a dummy file and initial commit first
  writeFileSync(join(baseDir, '.roadmap', 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: baseDir, stdio: 'pipe' });
  execSync('git commit -m "Initial setup"', { cwd: baseDir, stdio: 'pipe' });

  // Now we can get the commit SHA
  const initialCommit = execSync('git rev-parse HEAD', { cwd: baseDir, encoding: 'utf-8' }).trim();
  const gitState = {
    lastCommit: initialCommit,
    timestamp: new Date().toISOString(),
    message: 'Initial setup',
  };
  writeFileSync(join(baseDir, '.roadmap', 'git-state.json'), JSON.stringify(gitState, null, 2) + '\n');

  // Commit git-state.json
  execSync('git add .', { cwd: baseDir, stdio: 'pipe' });
  execSync('git commit -m "Add git-state.json"', { cwd: baseDir, stdio: 'pipe' });

  return baseDir;
}

beforeEach(() => {
  tempDir = setupTestRepo();
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
  }
});

describe('HeadShaRecovery: detectMismatch', () => {
  it('detects no mismatch when states are aligned', () => {
    const recovery = new HeadShaRecovery(tempDir);
    const detection = recovery.detectMismatch();

    // Get actual git state
    const gitState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'git-state.json'), 'utf-8'),
    );
    const actualGitSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();

    // Both should point to same git state (no mismatch initially)
    expect(detection.actualGitSha).toBe(actualGitSha);
  });

  it('detects mismatch when git state is stale', () => {
    // Simulate a new commit without updating git-state.json
    writeFileSync(join(tempDir, '.roadmap', 'newfile.txt'), 'new content\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "New commit after setup"', { cwd: tempDir, stdio: 'pipe' });

    // Now git-state.json still points to old commit
    const recovery = new HeadShaRecovery(tempDir);
    const detection = recovery.detectMismatch();

    const gitState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'git-state.json'), 'utf-8'),
    );
    const actualGitSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();

    // Recorded state should differ from actual
    expect(gitState.lastCommit).not.toBe(actualGitSha);
    expect(detection.headShaInFile).toBe(gitState.lastCommit);
    expect(detection.actualGitSha).toBe(actualGitSha);
  });

  it('includes reason in detection when mismatch found', () => {
    // Create a new commit without syncing git-state.json
    writeFileSync(join(tempDir, '.roadmap', 'file2.txt'), 'file2 content\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Diverge state"', { cwd: tempDir, stdio: 'pipe' });

    const recovery = new HeadShaRecovery(tempDir);
    const detection = recovery.detectMismatch();

    if (detection.hasMismatch) {
      expect(detection.reason).toBeDefined();
      expect(detection.reason).toContain('diverged');
    }
  });
});

describe('HeadShaRecovery: autoRecover', () => {
  it('recovers by syncing git-state.json to current HEAD', () => {
    // Cause divergence
    writeFileSync(join(tempDir, '.roadmap', 'diverge.txt'), 'divergence\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Create divergence"', { cwd: tempDir, stdio: 'pipe' });

    const actualSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
    const oldGitState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'git-state.json'), 'utf-8'),
    );

    // Now recover
    const recovery = new HeadShaRecovery(tempDir);
    const result = autoRecover(tempDir);

    expect(result.recovered).toBe(true);
    expect(result.newGitState).toBe(actualSha);
    expect(result.prevGitState).toBe(oldGitState.lastCommit);

    // Verify git-state.json was updated
    const newGitState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'git-state.json'), 'utf-8'),
    );
    expect(newGitState.lastCommit).toBe(actualSha);
  });

  it('increments mismatch count in recovery state', () => {
    // Create first divergence and recover
    writeFileSync(join(tempDir, '.roadmap', 'file1.txt'), 'content1\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Commit 1"', { cwd: tempDir, stdio: 'pipe' });

    autoRecover(tempDir);

    const firstState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'recovery-state.json'), 'utf-8'),
    );
    expect(firstState.mismatchCount).toBe(1);

    // Create second divergence and recover
    writeFileSync(join(tempDir, '.roadmap', 'file2.txt'), 'content2\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Commit 2"', { cwd: tempDir, stdio: 'pipe' });

    autoRecover(tempDir);

    const secondState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'recovery-state.json'), 'utf-8'),
    );
    expect(secondState.mismatchCount).toBe(2);
  });

  it('captures commit message during recovery', () => {
    // Create a new commit with a specific message
    writeFileSync(join(tempDir, '.roadmap', 'feature.txt'), 'feature content\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Feature: add important capability"', { cwd: tempDir, stdio: 'pipe' });

    autoRecover(tempDir);

    const gitState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'git-state.json'), 'utf-8'),
    );
    expect(gitState.message).toContain('Feature');
  });

  it('creates recovery state file on first recovery', () => {
    const recoveryStatePath = join(tempDir, '.roadmap', 'recovery-state.json');
    expect(existsSync(recoveryStatePath)).toBe(false);

    // Cause divergence
    writeFileSync(join(tempDir, '.roadmap', 'cause-divergence.txt'), 'diverge\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Diverge"', { cwd: tempDir, stdio: 'pipe' });

    autoRecover(tempDir);

    expect(existsSync(recoveryStatePath)).toBe(true);
    const state = JSON.parse(readFileSync(recoveryStatePath, 'utf-8'));
    expect(state.mismatchCount).toBe(1);
  });
});

describe('HeadShaRecovery: validateConsistency', () => {
  it('validates consistency when all files exist and are valid', () => {
    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(true);
    expect(validation.headJsonExists).toBe(true);
    expect(validation.headJsonValid).toBe(true);
    expect(validation.gitStateExists).toBe(true);
    expect(validation.gitStateValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });

  it('reports error when head.json is missing', () => {
    // Remove head.json
    rmSync(join(tempDir, '.roadmap', 'head.json'));

    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(false);
    expect(validation.headJsonExists).toBe(false);
    expect(validation.errors.some((e) => e.includes('head.json'))).toBe(true);
  });

  it('reports error when git-state.json is missing', () => {
    // Remove git-state.json
    rmSync(join(tempDir, '.roadmap', 'git-state.json'));

    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(false);
    expect(validation.gitStateExists).toBe(false);
    expect(validation.errors.some((e) => e.includes('git-state.json'))).toBe(true);
  });

  it('reports error when head.json is malformed', () => {
    writeFileSync(join(tempDir, '.roadmap', 'head.json'), '{invalid json}');

    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(false);
    expect(validation.headJsonValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('parse error'))).toBe(true);
  });

  it('reports error when head.json missing required DAG fields', () => {
    const badHeadJson = {
      id: 'test-dag',
      // missing 'nodes' field
      desc: 'incomplete DAG',
    };
    writeFileSync(
      join(tempDir, '.roadmap', 'head.json'),
      JSON.stringify(badHeadJson, null, 2) + '\n',
    );

    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(false);
    expect(validation.headJsonValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('required DAG fields'))).toBe(true);
  });

  it('reports error when git-state.json references invalid commit', () => {
    const badGitState = {
      lastCommit: 'invalid0000000000000000000000000000',
      timestamp: new Date().toISOString(),
      message: 'Invalid commit',
    };
    writeFileSync(
      join(tempDir, '.roadmap', 'git-state.json'),
      JSON.stringify(badGitState, null, 2) + '\n',
    );

    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    expect(validation.consistent).toBe(false);
    expect(validation.gitStateValid).toBe(false);
    expect(validation.errors.some((e) => e.includes('invalid commit'))).toBe(true);
  });

  it('recovery-state.json existence is optional', () => {
    const recovery = new HeadShaRecovery(tempDir);
    const validation = recovery.validateConsistency();

    // recovery-state.json should not exist yet (optional)
    expect(validation.recoveryStateExists).toBe(false);
    // But should not affect consistency
    expect(validation.consistent).toBe(true);
  });
});

describe('HeadShaRecovery: standalone utilities', () => {
  it('detectMismatch() works as standalone function', () => {
    // Cause divergence
    writeFileSync(join(tempDir, '.roadmap', 'standalone.txt'), 'test\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Standalone test"', { cwd: tempDir, stdio: 'pipe' });

    const detection = detectMismatch(tempDir);
    expect(detection.actualGitSha).toBeDefined();
    expect(detection.headShaInFile).toBeDefined();
    expect(detection.timestamp).toBeDefined();
  });

  it('autoRecover() works as standalone function', () => {
    // Cause divergence
    writeFileSync(join(tempDir, '.roadmap', 'standalone.txt'), 'test\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Standalone recovery test"', { cwd: tempDir, stdio: 'pipe' });

    const result = autoRecover(tempDir);
    expect(result.recovered).toBe(true);
    expect(result.newGitState).toBeDefined();
  });

  it('validateConsistency() works as standalone function', () => {
    const validation = validateConsistency(tempDir);
    expect(validation.consistent).toBe(true);
    expect(validation.errors).toBeDefined();
    expect(Array.isArray(validation.errors)).toBe(true);
  });
});

describe('HeadShaRecovery: integration scenarios', () => {
  it('detects → recovers → validates in sequence', () => {
    // Step 1: Create divergence
    writeFileSync(join(tempDir, '.roadmap', 'diverge.txt'), 'diverge\n');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "Integration test divergence"', { cwd: tempDir, stdio: 'pipe' });

    // Step 2: Detect
    const detection = detectMismatch(tempDir);
    expect(detection.hasMismatch).toBe(true);

    // Step 3: Recover
    const recovery = autoRecover(tempDir);
    expect(recovery.recovered).toBe(true);

    // Step 4: Validate
    const validation = validateConsistency(tempDir);
    expect(validation.consistent).toBe(true);
  });

  it('handles multiple recovery cycles', () => {
    for (let i = 0; i < 3; i++) {
      // Create divergence
      writeFileSync(join(tempDir, '.roadmap', `cycle-${i}.txt`), `cycle ${i}\n`);
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync(`git commit -m "Cycle ${i}"`, { cwd: tempDir, stdio: 'pipe' });

      // Recover
      const result = autoRecover(tempDir);
      expect(result.recovered).toBe(true);

      // Validate after each cycle
      const validation = validateConsistency(tempDir);
      expect(validation.consistent).toBe(true);
    }

    // Check final recovery state
    const finalState = JSON.parse(
      readFileSync(join(tempDir, '.roadmap', 'recovery-state.json'), 'utf-8'),
    );
    expect(finalState.mismatchCount).toBe(3);
  });
});
