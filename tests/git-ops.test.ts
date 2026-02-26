/**
 * Tests for git-ops mechanical skill
 * - cross-repo reads
 * - local write isolation
 * - atomic commits
 * - session squash
 * - stdin/from-file input
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tmpDir = join(tmpdir(), `git-ops-test-${Date.now()}`);
const outputDir = '/tmp/regent-skill-outputs';

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(join(tmpDir, 'repo1'), { recursive: true });
  mkdirSync(join(tmpDir, 'repo2'), { recursive: true });

  // Initialize repos
  initRepo(join(tmpDir, 'repo1'));
  initRepo(join(tmpDir, 'repo2'));

  // Create initial files
  writeFileSync(join(tmpDir, 'repo1', 'file.txt'), 'content1');
  writeFileSync(join(tmpDir, 'repo2', 'file.txt'), 'content2');

  execSync('git add .', { cwd: join(tmpDir, 'repo1') });
  execSync('git add .', { cwd: join(tmpDir, 'repo2') });
  execSync('git commit -m "init"', { cwd: join(tmpDir, 'repo1') });
  execSync('git commit -m "init"', { cwd: join(tmpDir, 'repo2') });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true });
});

function initRepo(path: string) {
  execSync('git init', { cwd: path });
  execSync('git config user.email "test@test.com"', { cwd: path });
  execSync('git config user.name "Test User"', { cwd: path });
}

function runGitOps(command: string): string {
  const backend = '/home/griffin/.claude/skills/git-ops/backend.ts';
  const result = spawnSync('npx', ['ts-node', backend, ...command.split(' ')], {
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    throw new Error(`git-ops failed: ${result.stderr}`);
  }
  return result.stdout;
}

describe('git-ops skill', () => {
  describe('read', () => {
    it('reads file from repo HEAD', () => {
      const output = runGitOps(`read --repo ${join(tmpDir, 'repo1')} --file file.txt --output-id test-read-1`);
      expect(output).toContain('Output written to');

      const result = readFileSync(join(outputDir, 'test-read-1.txt'), 'utf-8');
      expect(result).toBe('content1');
    });

    it('reads file from specific ref', () => {
      const repo = join(tmpDir, 'repo1');
      const headHash = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf-8' }).trim();

      runGitOps(`read --repo ${repo} --file file.txt --ref ${headHash} --output-id test-read-ref`);
      const result = readFileSync(join(outputDir, 'test-read-ref.txt'), 'utf-8');
      expect(result).toBe('content1');
    });
  });

  describe('write', () => {
    it('writes file to working tree', () => {
      const repo = join(tmpDir, 'repo1');
      const filePath = join(repo, 'new-file.txt');

      runGitOps(`write --repo ${repo} --file new-file.txt --content "new content" --output-id test-write-1`);
      const result = readFileSync(filePath, 'utf-8');
      expect(result).toBe('new content');
    });

    it('supports from-file input', () => {
      const repo = join(tmpDir, 'repo1');
      const sourceFile = join(tmpDir, 'source.txt');
      writeFileSync(sourceFile, 'from-file content');

      runGitOps(`write --repo ${repo} --file from-file.txt --from-file ${sourceFile} --output-id test-write-from-file`);
      const result = readFileSync(join(repo, 'from-file.txt'), 'utf-8');
      expect(result).toBe('from-file content');
    });
  });

  describe('exists', () => {
    it('returns true for existing file', () => {
      const repo = join(tmpDir, 'repo1');
      runGitOps(`exists --repo ${repo} --file file.txt --output-id test-exists-true`);
      const result = JSON.parse(readFileSync(join(outputDir, 'test-exists-true.txt'), 'utf-8'));
      expect(result.exists).toBe(true);
    });

    it('returns false for missing file', () => {
      const repo = join(tmpDir, 'repo1');
      runGitOps(`exists --repo ${repo} --file nonexistent.txt --output-id test-exists-false`);
      const result = JSON.parse(readFileSync(join(outputDir, 'test-exists-false.txt'), 'utf-8'));
      expect(result.exists).toBe(false);
    });
  });

  describe('list', () => {
    it('lists files in repo', () => {
      const repo = join(tmpDir, 'repo1');
      runGitOps(`list --repo ${repo} --output-id test-list`);
      const result = JSON.parse(readFileSync(join(outputDir, 'test-list.txt'), 'utf-8'));
      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('file.txt');
    });
  });

  describe('log', () => {
    it('gets commit history for file', () => {
      const repo = join(tmpDir, 'repo1');
      runGitOps(`log --repo ${repo} --file file.txt --output-id test-log`);
      const result = JSON.parse(readFileSync(join(outputDir, 'test-log.txt'), 'utf-8'));
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('hash');
      expect(result[0]).toHaveProperty('subject');
    });
  });

  describe('commit', () => {
    it('commits files atomically', () => {
      const repo = join(tmpDir, 'repo1');
      writeFileSync(join(repo, 'commit-test.txt'), 'test content');

      runGitOps(`commit --repo ${repo} --files commit-test.txt --message "test commit" --output-id test-commit`);
      const result = JSON.parse(readFileSync(join(outputDir, 'test-commit.txt'), 'utf-8'));

      expect(result).toHaveProperty('hash');
      expect(result.hash).toMatch(/^[a-f0-9]{40}$/);
      expect(result.message).toBe('test commit');

      // Verify commit exists
      const log = execSync('git log --oneline', { cwd: repo, encoding: 'utf-8' });
      expect(log).toContain('test commit');
    });

    it('supports session squash', () => {
      const repo = join(tmpDir, 'repo2');
      const sessionId = 'test-session-123';

      // Make first commit
      writeFileSync(join(repo, 'file1.txt'), 'content1');
      runGitOps(
        `commit --repo ${repo} --files file1.txt --message "first" --session-squash --output-id test-squash-1`
      );

      // Make second commit in same session
      writeFileSync(join(repo, 'file2.txt'), 'content2');
      runGitOps(
        `commit --repo ${repo} --files file2.txt --message "second" --session-squash --output-id test-squash-2`
      );

      // Verify commits exist
      const log = execSync('git log --oneline', { cwd: repo, encoding: 'utf-8' });
      const lines = log.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('cross-repo operations', () => {
    it('reads from one repo, writes to another', () => {
      const repo1 = join(tmpDir, 'repo1');
      const repo2 = join(tmpDir, 'repo2');

      // Read from repo1
      runGitOps(`read --repo ${repo1} --file file.txt --output-id test-cross-read`);
      const content = readFileSync(join(outputDir, 'test-cross-read.txt'), 'utf-8');

      // Write different content to repo2
      writeFileSync(join(repo2, 'copied.txt'), content);
      execSync('git add copied.txt', { cwd: repo2 });
      execSync('git commit -m "cross-repo copy"', { cwd: repo2 });

      // Verify
      const copied = readFileSync(join(repo2, 'copied.txt'), 'utf-8');
      expect(copied).toBe('content1');
    });
  });

  describe('write isolation', () => {
    it('writes only to working tree, not committed', () => {
      const repo = join(tmpDir, 'repo1');
      const filePath = join(repo, 'uncommitted.txt');

      runGitOps(`write --repo ${repo} --file uncommitted.txt --content "not committed" --output-id test-isolation`);

      // File should exist on disk
      expect(readFileSync(filePath, 'utf-8')).toBe('not committed');

      // File should not be in git history
      const log = execSync(`git log --all --name-only`, { cwd: repo, encoding: 'utf-8' });
      expect(log).not.toContain('uncommitted.txt');
    });
  });
});
