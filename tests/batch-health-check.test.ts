// @module tests/batch-health-check
// Tests for batch health check utility: validates hardening stack atomicity

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BatchHealthCheck,
  checkBatchHealth,
  type BatchHealthReport,
} from '../src/lib/roadmap/batch-health-check.ts';

let testRepo: string;

/**
 * Create a minimal test repo with head.json and trail.jsonl
 */
async function setupTestRepo(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'batch-health-'));

  // Initialize git repo
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });

  // Create .roadmap directory
  const roadmapDir = join(dir, '.roadmap');
  await fs.mkdir(roadmapDir, { recursive: true });

  // Create head.json with sample nodes
  const headJson = {
    id: 'test-dag',
    nodes: {
      'node-a': {
        id: 'node-a',
        produces: ['artifact-a.json', 'artifact-a.md'],
        consumes: [],
        deps: [],
      },
      'node-b': {
        id: 'node-b',
        produces: ['artifact-b.json'],
        consumes: ['artifact-a.json'],
        deps: ['node-a'],
      },
    },
    headSha: 'initial',
  };
  await fs.writeFile(join(roadmapDir, 'head.json'), JSON.stringify(headJson, null, 2));

  // Create trail.jsonl
  await fs.writeFile(
    join(roadmapDir, 'trail.jsonl'),
    JSON.stringify({ ts: '2026-03-02T00:00:00Z', cmd: 'init' }) + '\n'
  );

  // Initial commit to get valid headSha
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  const sha = execSync('git commit --no-verify -m "init"', {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Update head.json with actual git SHA
  const gitHead = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim();
  headJson.headSha = gitHead;
  await fs.writeFile(join(roadmapDir, 'head.json'), JSON.stringify(headJson, null, 2));
  execSync('git add .roadmap/head.json', { cwd: dir, stdio: 'pipe' });
  execSync('git commit --no-verify -m "update-headsha"', { cwd: dir, stdio: 'pipe' });

  return dir;
}

/**
 * Clean up test repo
 */
async function teardownTestRepo(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

beforeEach(async () => {
  testRepo = await setupTestRepo();
});

afterEach(async () => {
  await teardownTestRepo(testRepo);
});

describe('BatchHealthCheck: artifact existence', () => {
  it('detects all artifacts present', async () => {
    // Create artifacts for node-a
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');

    const report = await checkBatchHealth(testRepo, ['node-a']);

    expect(report.passed).toBe(true);
    expect(report.artifactsMissing).toHaveLength(0);
    expect(report.coverage).toBe(100);
  });

  it('detects missing artifacts', async () => {
    // Create only one artifact for node-a
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    // missing: artifact-a.md

    const report = await checkBatchHealth(testRepo, ['node-a']);

    expect(report.passed).toBe(false);
    expect(report.artifactsMissing).toContain('node-a:artifact-a.md');
    expect(report.coverage).toBe(50);
  });

  it('handles multi-node batch with partial artifacts', async () => {
    // Node A complete
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');

    // Node B incomplete
    // missing: artifact-b.json

    const report = await checkBatchHealth(testRepo, ['node-a', 'node-b']);

    expect(report.artifactsMissing).toContain('node-b:artifact-b.json');
    expect(report.coverage).toBeLessThan(100);
  });
});

describe('BatchHealthCheck: schema compliance', () => {
  it('validates JSON artifacts are parseable', async () => {
    // Valid JSON
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ valid: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Valid markdown');

    const report = await checkBatchHealth(testRepo, ['node-a']);

    const schemaResult = report.results.find(r => r.category === 'schema');
    expect(schemaResult?.passed).toBe(true);
  });

  it('detects invalid JSON in artifacts', async () => {
    // Invalid JSON
    await fs.writeFile(join(testRepo, 'artifact-a.json'), '{not valid json}');
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Valid markdown');

    const report = await checkBatchHealth(testRepo, ['node-a']);

    const schemaResult = report.results.find(r => r.category === 'schema');
    expect(schemaResult?.passed).toBe(false);
    expect(schemaResult?.details).toContain('invalid JSON');
  });
});

describe('BatchHealthCheck: trail coherence', () => {
  it('verifies trail has entries for completed nodes', async () => {
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');

    // Add complete entries
    content += JSON.stringify({
      ts: '2026-03-02T00:00:01Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-a' },
    }) + '\n';
    content += JSON.stringify({
      ts: '2026-03-02T00:00:02Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-b' },
    }) + '\n';

    await fs.writeFile(trailPath, content);

    const report = await checkBatchHealth(testRepo, ['node-a', 'node-b']);

    const trailResult = report.results.find(r => r.category === 'trail-coherence');
    expect(trailResult?.passed).toBe(true);
  });

  it('detects missing trail entries for completed nodes', async () => {
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');

    // Only node-a completed in trail
    content += JSON.stringify({
      ts: '2026-03-02T00:00:01Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-a' },
    }) + '\n';

    await fs.writeFile(trailPath, content);

    const report = await checkBatchHealth(testRepo, ['node-a', 'node-b']);

    const trailResult = report.results.find(r => r.category === 'trail-coherence');
    // Trail coherence is now graceful (warning, not blocking error)
    expect(trailResult?.passed).toBe(true);
    expect(trailResult?.severity).toBe('warning');
    expect(trailResult?.details).toContain('node-b');
  });
});

describe('BatchHealthCheck: head.json consistency', () => {
  it('verifies headSha matches git HEAD', async () => {
    const report = await checkBatchHealth(testRepo, ['node-a']);

    const headResult = report.results.find(r => r.category === 'head-consistency');
    expect(headResult?.passed).toBe(true);
  });

  it('detects headSha mismatch as warning (recoverable)', async () => {
    const headPath = join(testRepo, '.roadmap', 'head.json');
    const head = JSON.parse(await fs.readFile(headPath, 'utf-8'));

    // Corrupt headSha
    head.headSha = 'invalid-sha';
    await fs.writeFile(headPath, JSON.stringify(head));

    const report = await checkBatchHealth(testRepo, ['node-a']);

    const headResult = report.results.find(r => r.category === 'head-consistency');
    // Mismatch is a warning, not a blocking error (headsha-recovery can fix)
    expect(headResult?.passed).toBe(true);
    expect(headResult?.severity).toBe('warning');
    expect(headResult?.details).toContain('mismatch');
  });
});

describe('BatchHealthCheck: integration', () => {
  it('produces comprehensive report with all checks', async () => {
    // Create all artifacts
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');
    await fs.writeFile(join(testRepo, 'artifact-b.json'), JSON.stringify({ ok: true }));

    // Add trail entries
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');
    content += JSON.stringify({
      ts: '2026-03-02T00:00:01Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-a' },
    }) + '\n';
    content += JSON.stringify({
      ts: '2026-03-02T00:00:02Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-b' },
    }) + '\n';
    await fs.writeFile(trailPath, content);

    const report = await checkBatchHealth(testRepo, ['node-a', 'node-b']);

    // All checks should pass
    expect(report.passed).toBe(true);
    expect(report.artifactsMissing).toHaveLength(0);
    expect(report.coverage).toBe(100);

    // Should have multiple result categories
    const categories = new Set(report.results.map(r => r.category));
    expect(categories.size).toBeGreaterThan(2);
  });

  it('generates clear summary for passed batch', async () => {
    // Create all artifacts
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');

    const report = await checkBatchHealth(testRepo, ['node-a']);

    expect(report.summary).toContain('passed');
    expect(report.summary).toContain('2');
    expect(report.summary).toContain('artifacts');
  });

  it('generates clear summary for failed batch', async () => {
    // Missing all artifacts
    const report = await checkBatchHealth(testRepo, ['node-a', 'node-b']);

    expect(report.summary).toContain('FAILED');
    expect(report.summary).toContain('errors');
  });

  it('handles empty batch gracefully', async () => {
    const report = await checkBatchHealth(testRepo, []);

    expect(report.nodeIds).toHaveLength(0);
    expect(report.passed).toBe(false);
    expect(report.results.length).toBeGreaterThan(0);
  });
});

describe('BatchHealthCheck: instance methods', () => {
  it('creates checker instance and checks batch', async () => {
    const checker = new BatchHealthCheck(testRepo);

    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');

    const report = await checker.checkBatch(['node-a']);

    expect(report.nodeIds).toContain('node-a');
    expect(report.passed).toBe(true);
  });

  it('auto-detects last completed batch if nodeIds not provided', async () => {
    const checker = new BatchHealthCheck(testRepo);

    // Create artifacts
    await fs.writeFile(join(testRepo, 'artifact-a.json'), JSON.stringify({ ok: true }));
    await fs.writeFile(join(testRepo, 'artifact-a.md'), '# Report');

    // Add trail entry with level
    const trailPath = join(testRepo, '.roadmap', 'trail.jsonl');
    let content = await fs.readFile(trailPath, 'utf-8');
    content += JSON.stringify({
      ts: '2026-03-02T00:00:01Z',
      cmd: 'complete',
      level: 0,
      detail: { nodeId: 'node-a' },
    }) + '\n';
    await fs.writeFile(trailPath, content);

    // Check without specifying nodeIds
    const report = await checker.checkBatch();

    expect(report.nodeIds).toContain('node-a');
    expect(report.batchLevel).toBe(0);
  });
});
