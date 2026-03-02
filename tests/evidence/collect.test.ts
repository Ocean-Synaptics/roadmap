import { describe, it, expect, beforeAll } from 'vitest';
import { collectEvidence, addCheckResult, addClaim, type EvidenceBundle } from '../../src/lib/evidence/collect.js';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('collectEvidence', () => {
  let tempRepo: string;
  let beforeSha: string;
  let afterSha: string;

  beforeAll(() => {
    // Create a temporary git repo for testing
    tempRepo = mkdtempSync('evidence-test-');

    try {
      // Initialize git repo
      execSync('git init', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: tempRepo, stdio: 'pipe' });

      // Create initial commit
      writeFileSync(join(tempRepo, 'file1.txt'), 'content1');
      execSync('git add file1.txt', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tempRepo, stdio: 'pipe' });

      // Get the first commit hash
      beforeSha = execSync('git rev-parse HEAD', { cwd: tempRepo, encoding: 'utf-8' }).trim();

      // Make changes: add a file, modify another
      writeFileSync(join(tempRepo, 'file1.txt'), 'modified content');
      writeFileSync(join(tempRepo, 'file2.txt'), 'new file content');

      execSync('git add .', { cwd: tempRepo, stdio: 'pipe' });
      execSync('git commit -m "changes"', { cwd: tempRepo, stdio: 'pipe' });

      // Get the second commit hash
      afterSha = execSync('git rev-parse HEAD', { cwd: tempRepo, encoding: 'utf-8' }).trim();
    } catch (e) {
      rmSync(tempRepo, { recursive: true });
      throw e;
    }
  });

  it('collects git diffs between commits', () => {
    const bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);

    expect(bundle.schema_version).toBe(1);
    expect(bundle.headSha).toBe(afterSha);
    expect(bundle.baseSha).toBe(beforeSha);
    expect(bundle.gitDiffs.length).toBeGreaterThan(0);
  });

  it('tracks file status (added, modified)', () => {
    const bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);

    const statuses = bundle.gitDiffs.map((d) => d.status);
    expect(statuses).toContain('added'); // file2.txt
    expect(statuses).toContain('modified'); // file1.txt
  });

  it('tracks additions and deletions', () => {
    const bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);

    const fileStats = bundle.gitDiffs.reduce(
      (acc, d) => ({
        ...acc,
        [d.file]: { additions: d.additions, deletions: d.deletions },
      }),
      {} as Record<string, { additions: number; deletions: number }>
    );

    expect(fileStats['file1.txt'].additions).toBeGreaterThan(0);
  });

  it('tracks file reads from readPaths', () => {
    const bundle = collectEvidence(tempRepo, beforeSha, afterSha, ['file1.txt']);

    expect(bundle.reads.length).toBe(1);
    expect(bundle.reads[0].path).toBe('file1.txt');
    expect(bundle.reads[0].timestamp).toBeGreaterThan(0);
  });

  it('returns empty diffs for identical commits', () => {
    const bundle = collectEvidence(tempRepo, afterSha, afterSha, []);

    expect(bundle.gitDiffs.length).toBe(0);
  });

  describe('addCheckResult', () => {
    it('appends check results to bundle', () => {
      const bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);

      const updated = addCheckResult(bundle, 'test', 'unit-tests', true, 1000);

      expect(updated.checks.length).toBe(1);
      expect(updated.checks[0].name).toBe('unit-tests');
      expect(updated.checks[0].passed).toBe(true);
    });

    it('supports multiple check types', () => {
      let bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);

      bundle = addCheckResult(bundle, 'test', 'test1', true);
      bundle = addCheckResult(bundle, 'lint', 'eslint', true);
      bundle = addCheckResult(bundle, 'typecheck', 'tsc', true);
      bundle = addCheckResult(bundle, 'build', 'build', true);

      expect(bundle.checks.length).toBe(4);
      expect(bundle.checks.map((c) => c.type)).toContain('test');
      expect(bundle.checks.map((c) => c.type)).toContain('lint');
      expect(bundle.checks.map((c) => c.type)).toContain('typecheck');
      expect(bundle.checks.map((c) => c.type)).toContain('build');
    });
  });

  describe('addClaim', () => {
    it('maps a claim to backing evidence', () => {
      let bundle = collectEvidence(tempRepo, beforeSha, afterSha, ['file1.txt']);
      bundle = addCheckResult(bundle, 'test', 'test-suite', true);

      bundle = addClaim(bundle, 'Created new feature', {
        gitDiffs: bundle.gitDiffs,
        reads: bundle.reads,
        checks: bundle.checks,
      });

      expect(bundle.entries.length).toBe(1);
      expect(bundle.entries[0].claim).toBe('Created new feature');
      expect(bundle.entries[0].backingEvidence.gitDiffs?.length).toBeGreaterThan(0);
      expect(bundle.entries[0].backingEvidence.reads?.length).toBe(1);
      expect(bundle.entries[0].backingEvidence.checks?.length).toBe(1);
    });

    it('supports multiple claims', () => {
      let bundle = collectEvidence(tempRepo, beforeSha, afterSha, []);
      bundle = addCheckResult(bundle, 'test', 'test1', true);

      bundle = addClaim(bundle, 'Claim 1', { checks: bundle.checks });
      bundle = addClaim(bundle, 'Claim 2', { gitDiffs: bundle.gitDiffs });

      expect(bundle.entries.length).toBe(2);
    });
  });
});
