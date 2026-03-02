import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DAGManifest, validateManifest, scanDAGManifestForViolations } from '../src/lib/enforcement/dag-manifest';

describe('DAGManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync('test-dag-');
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('scans .roadmap/head.*.json files', () => {
    const validDAG = {
      id: 'test-dag-001',
      desc: 'Test DAG',
      init: 'node-a',
      term: 'node-z',
      nodes: {
        'node-a': { id: 'node-a', desc: 'Start' },
        'node-z': { id: 'node-z', desc: 'End' },
      },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.test.json'), JSON.stringify(validDAG));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.scannedFiles.length).toBe(1);
    expect(report.entries[0].dagId).toBe('test-dag-001');
    expect(report.entries[0].valid).toBe(true);
  });

  it('validates required DAG fields', () => {
    const missingId = { desc: 'No ID', init: 'a', term: 'z', nodes: {} };
    writeFileSync(join(tmpDir, '.roadmap', 'head.invalid.json'), JSON.stringify(missingId));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.entries[0].valid).toBe(false);
    expect(report.invalidCount).toBe(1);
  });

  it('detects orphaned DAGs', () => {
    const activeDAG = {
      id: 'active-dag',
      desc: 'Active',
      init: 'a',
      term: 'z',
      nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
    };

    const orphanedDAG = {
      id: 'orphaned-dag',
      desc: 'Orphaned',
      init: 'a',
      term: 'z',
      nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(activeDAG));
    writeFileSync(join(tmpDir, '.roadmap', 'head.old.json'), JSON.stringify(orphanedDAG));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    const orphanedEntry = report.entries.find((e) => e.dagId === 'orphaned-dag');
    expect(orphanedEntry?.orphaned).toBe(true);
    expect(report.orphanedCount).toBe(1);
  });

  it('validates node structure', () => {
    const badNodes = {
      id: 'bad-dag',
      desc: 'Bad nodes',
      init: 'a',
      term: 'z',
      nodes: { a: 'not-an-object', z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.bad.json'), JSON.stringify(badNodes));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.entries[0].valid).toBe(false);
    expect(report.invalidCount).toBe(1);
  });

  it('validates init/term node existence', () => {
    const missingInit = {
      id: 'missing-init',
      desc: 'No init',
      init: 'missing-node',
      term: 'z',
      nodes: { z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.noninit.json'), JSON.stringify(missingInit));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.entries[0].valid).toBe(false);
  });

  it('detects missing node fields', () => {
    const missingDesc = {
      id: 'bad-dag',
      desc: 'Bad node structure',
      init: 'a',
      term: 'z',
      nodes: { a: { id: 'a' }, z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.nodesc.json'), JSON.stringify(missingDesc));

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.entries[0].valid).toBe(false);
    expect(report.entries[0].error).toContain('missing id or desc');
  });

  it('handles nonexistent .roadmap directory', () => {
    const emptyDir = mkdtempSync('test-empty-');
    const manifest = new DAGManifest(emptyDir);
    const report = manifest.scan();

    expect(report.scannedFiles.length).toBe(0);
    expect(report.entries.length).toBe(0);
    expect(report.summary).toContain('does not exist');

    rmSync(emptyDir, { recursive: true });
  });

  it('handles JSON parse errors', () => {
    writeFileSync(join(tmpDir, '.roadmap', 'head.corrupt.json'), 'not valid json {');

    const manifest = new DAGManifest(tmpDir);
    const report = manifest.scan();

    expect(report.entries[0].valid).toBe(false);
    expect(report.entries[0].error).toContain('Parse error');
  });
});

describe('validateManifest', () => {
  it('passes for valid report', () => {
    const report = {
      timestamp: '2026-03-02T00:00:00Z',
      repoRoot: '/test',
      scannedFiles: ['head.test.json'],
      entries: [
        {
          path: 'head.test.json',
          dagId: 'test-dag',
          found: true,
          valid: true,
          nodeCount: 2,
          hasDesignDocs: true,
          orphaned: false,
          mtime: 1,
        },
      ],
      orphanedCount: 0,
      invalidCount: 0,
      designDocGaps: [],
      summary: 'all valid',
    };

    const result = validateManifest(report);
    expect(result.passed).toBe(true);
  });

  it('fails for invalid DAGs', () => {
    const report = {
      timestamp: '2026-03-02T00:00:00Z',
      repoRoot: '/test',
      scannedFiles: ['head.test.json'],
      entries: [],
      orphanedCount: 0,
      invalidCount: 1,
      designDocGaps: [],
      summary: 'invalid',
    };

    const result = validateManifest(report);
    expect(result.passed).toBe(false);
    expect(result.evidence).toContain('invalid structure');
  });

  it('fails for missing design docs', () => {
    const report = {
      timestamp: '2026-03-02T00:00:00Z',
      repoRoot: '/test',
      scannedFiles: ['head.test.json'],
      entries: [],
      orphanedCount: 0,
      invalidCount: 0,
      designDocGaps: ['missing-dag'],
      summary: 'missing docs',
    };

    const result = validateManifest(report);
    expect(result.passed).toBe(false);
    expect(result.evidence).toContain('design documentation');
  });
});

describe('scanDAGManifestForViolations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync('test-dag-');
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('returns empty for healthy manifest', () => {
    const violations = scanDAGManifestForViolations(tmpDir);
    expect(violations.length).toBe(0);
  });

  it('reports invalid-structure violations', () => {
    const invalidDAG = {
      id: 'broken-dag',
      init: 'a',
      term: 'z',
      nodes: {},
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.invalid.json'), JSON.stringify(invalidDAG));

    const violations = scanDAGManifestForViolations(tmpDir);
    expect(violations.length).toBe(1);
    expect(violations[0].type).toBe('invalid-structure');
    expect(violations[0].dagId).toBe('broken-dag');
    expect(violations[0].remediation).toContain('.roadmap/');
  });

  it('reports orphaned violations', () => {
    const orphanedDAG = {
      id: 'orphan-dag',
      desc: 'Orphaned DAG',
      init: 'a',
      term: 'z',
      nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.old.json'), JSON.stringify(orphanedDAG));

    const violations = scanDAGManifestForViolations(tmpDir);
    const orphanViolations = violations.filter((v) => v.type === 'orphaned');
    expect(orphanViolations.length).toBeGreaterThan(0);
    expect(orphanViolations[0].dagId).toBe('orphan-dag');
  });

  it('includes remediation guidance in violations', () => {
    const invalidDAG = {
      id: 'bad-dag',
      init: 'a',
      term: 'z',
      nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
    };

    writeFileSync(join(tmpDir, '.roadmap', 'head.broken.json'), JSON.stringify(invalidDAG));

    const violations = scanDAGManifestForViolations(tmpDir);
    const violation = violations.find((v) => v.dagId === 'bad-dag');
    expect(violation).toBeDefined();
    expect(violation?.remediation).toBeTruthy();
  });
});
