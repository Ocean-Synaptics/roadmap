// Unit + integration tests for init flow
//
// Tests: directory creation, git integration, template presence

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initializeSpecify,
  isSpecifyInitialized,
  getInitializationStatus,
  InitializationStatus,
} from '../src/lib/init.ts';

// Helper: create isolated test directory
function createTestDir(): string {
  const testDir = join(tmpdir(), `roadmap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Helper: clean up test directory
function cleanupTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('initializeSpecify', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('creates .specify directory', () => {
    const result = initializeSpecify({ projectRoot: testDir });

    expect(result.ok).toBe(true);
    expect(result.status.directoryCreated).toBe(true);
    expect(existsSync(result.status.specifyDir)).toBe(true);
    expect(result.status.specifyDir).toBe(join(testDir, '.specify'));
  });

  it('creates .roadmap/metaflow/spec-kit directory', () => {
    const result = initializeSpecify({ projectRoot: testDir });

    expect(result.ok).toBe(true);
    expect(result.status.directoryCreated).toBe(true);
    expect(existsSync(result.status.roadmapDir)).toBe(true);
    expect(result.status.roadmapDir).toBe(
      join(testDir, '.roadmap', 'metaflow', 'spec-kit')
    );
  });

  it('detects existing git repository', () => {
    // Create .git directory to simulate existing repo
    mkdirSync(join(testDir, '.git'), { recursive: true });

    const result = initializeSpecify({ projectRoot: testDir });

    expect(result.ok).toBe(true);
    expect(result.status.gitRepo).toBe(true);
    expect(result.status.gitInitialized).toBe(false);
  });

  it('initializes git when requested and repo does not exist', () => {
    const result = initializeSpecify({
      projectRoot: testDir,
      gitInit: true,
    });

    expect(result.ok).toBe(true);
    expect(result.status.gitInitialized).toBe(true);
    expect(result.status.gitRepo).toBe(true);
    expect(existsSync(join(testDir, '.git'))).toBe(true);
  });

  it('skips git initialization when repo already exists', () => {
    // Create .git directory first
    mkdirSync(join(testDir, '.git'), { recursive: true });

    const result = initializeSpecify({
      projectRoot: testDir,
      gitInit: true,
    });

    expect(result.ok).toBe(true);
    expect(result.status.gitInitialized).toBe(false);
    expect(result.status.gitRepo).toBe(true);
  });

  it('handles idempotent calls (directories already exist)', () => {
    const firstCall = initializeSpecify({ projectRoot: testDir });
    expect(firstCall.ok).toBe(true);
    expect(firstCall.status.directoryCreated).toBe(true);

    const secondCall = initializeSpecify({ projectRoot: testDir });
    expect(secondCall.ok).toBe(true);
    expect(secondCall.status.directoryCreated).toBe(false);
    expect(existsSync(secondCall.status.specifyDir)).toBe(true);
    expect(existsSync(secondCall.status.roadmapDir)).toBe(true);
  });
});

describe('isSpecifyInitialized', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('returns false when directories do not exist', () => {
    const result = isSpecifyInitialized(testDir);
    expect(result).toBe(false);
  });

  it('returns false when only .specify exists', () => {
    mkdirSync(join(testDir, '.specify'), { recursive: true });

    const result = isSpecifyInitialized(testDir);
    expect(result).toBe(false);
  });

  it('returns false when only .roadmap/metaflow/spec-kit exists', () => {
    mkdirSync(join(testDir, '.roadmap', 'metaflow', 'spec-kit'), { recursive: true });

    const result = isSpecifyInitialized(testDir);
    expect(result).toBe(false);
  });

  it('returns true when both directories exist', () => {
    initializeSpecify({ projectRoot: testDir });

    const result = isSpecifyInitialized(testDir);
    expect(result).toBe(true);
  });
});

describe('getInitializationStatus', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('returns correct paths for uninitialized project', () => {
    const status = getInitializationStatus(testDir);

    expect(status.specifyDir).toBe(join(testDir, '.specify'));
    expect(status.roadmapDir).toBe(join(testDir, '.roadmap', 'metaflow', 'spec-kit'));
    expect(status.directoryCreated).toBe(false);
    expect(status.gitRepo).toBe(false);
  });

  it('returns correct paths after initialization', () => {
    initializeSpecify({ projectRoot: testDir });

    const status = getInitializationStatus(testDir);

    expect(status.directoryCreated).toBe(true);
    expect(existsSync(status.specifyDir)).toBe(true);
    expect(existsSync(status.roadmapDir)).toBe(true);
  });

  it('detects git repository status', () => {
    mkdirSync(join(testDir, '.git'), { recursive: true });

    const status = getInitializationStatus(testDir);

    expect(status.gitRepo).toBe(true);
  });
});

describe('integration: full init workflow', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('completes initialization workflow with git', () => {
    // Step 1: Initialize with git
    const result = initializeSpecify({
      projectRoot: testDir,
      gitInit: true,
    });

    expect(result.ok).toBe(true);
    expect(result.status.gitInitialized).toBe(true);

    // Step 2: Verify initialization state
    const isInit = isSpecifyInitialized(testDir);
    expect(isInit).toBe(true);

    // Step 3: Get status
    const status = getInitializationStatus(testDir);
    expect(status.directoryCreated).toBe(true);
    expect(status.gitRepo).toBe(true);
    expect(existsSync(status.specifyDir)).toBe(true);
    expect(existsSync(status.roadmapDir)).toBe(true);
  });

  it('completes initialization workflow without git', () => {
    // Step 1: Initialize without git
    const result = initializeSpecify({
      projectRoot: testDir,
      gitInit: false,
    });

    expect(result.ok).toBe(true);

    // Step 2: Verify directories created
    const isInit = isSpecifyInitialized(testDir);
    expect(isInit).toBe(true);

    // Step 3: Confirm no git repo
    const status = getInitializationStatus(testDir);
    expect(status.gitRepo).toBe(false);
  });
});
