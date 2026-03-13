import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanActiveDAGs, loadFleetContext } from '../src/runtime/fleet.ts';
import type { FleetFrontierNode } from '../src/lib/fleet-types.ts';
import { FleetFrontierNodeSchema } from '../src/lib/fleet-types.ts';

// --- Helpers ---

function makeHeadsDir(repoDir: string): string {
  const headsDir = join(repoDir, '.roadmap', 'heads');
  mkdirSync(headsDir, { recursive: true });
  return headsDir;
}

function writeHead(dir: string, name: string, payload: object): void {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(payload));
}

// --- scanActiveDAGs ---

describe('scanActiveDAGs', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'fleet-discovery-'));
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('returns empty array when heads/ does not exist', () => {
    mkdirSync(join(repoDir, '.roadmap'), { recursive: true });
    expect(scanActiveDAGs(repoDir)).toEqual([]);
  });

  it('returns active DAG from heads/ that has no _lineage.completedAt', () => {
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'active-dag', { id: 'active-dag', desc: 'still running' });

    const result = scanActiveDAGs(repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].dagId).toBe('active-dag');
    expect(result[0].desc).toBe('still running');
  });

  it('filters out DAGs with _lineage.completedAt', () => {
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'completed-dag', {
      id: 'completed-dag',
      desc: 'finished',
      _lineage: { completedAt: '2026-01-01T00:00:00Z' },
    });

    expect(scanActiveDAGs(repoDir)).toHaveLength(0);
  });

  it('returns all active DAGs and excludes completed ones from a mixed heads/ dir', () => {
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'dag-alpha', { id: 'dag-alpha', desc: 'alpha' });
    writeHead(headsDir, 'dag-beta', {
      id: 'dag-beta',
      desc: 'beta done',
      _lineage: { completedAt: '2026-02-01T00:00:00Z' },
    });
    writeHead(headsDir, 'dag-gamma', { id: 'dag-gamma', desc: 'gamma' });

    const result = scanActiveDAGs(repoDir);
    const ids = result.map(r => r.dagId);
    expect(ids).toContain('dag-alpha');
    expect(ids).toContain('dag-gamma');
    expect(ids).not.toContain('dag-beta');
  });

  it('falls back to filename (without .json) when id is absent', () => {
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'inferred-id', { desc: 'no id field' });

    const result = scanActiveDAGs(repoDir);
    expect(result[0].dagId).toBe('inferred-id');
  });

  it('skips malformed JSON files without throwing', () => {
    const headsDir = makeHeadsDir(repoDir);
    writeFileSync(join(headsDir, 'broken.json'), 'not valid json {{{');
    writeHead(headsDir, 'good-dag', { id: 'good-dag' });

    const result = scanActiveDAGs(repoDir);
    expect(result).toHaveLength(1);
    expect(result[0].dagId).toBe('good-dag');
  });
});

// --- loadFleetContext — activeDAGs integration ---

describe('loadFleetContext activeDAGs population', () => {
  let compilerDir: string;
  let repoDir: string;

  beforeEach(() => {
    compilerDir = mkdtempSync(join(tmpdir(), 'fleet-disc-compiler-'));
    repoDir = mkdtempSync(join(tmpdir(), 'fleet-disc-repo-'));

    mkdirSync(join(compilerDir, '.roadmap'), { recursive: true });
    writeFileSync(join(compilerDir, '.roadmap', 'completed.json'), '[]');
  });

  afterEach(() => {
    rmSync(compilerDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('surfaces active heads/ DAGs on a repo that has no head.json', () => {
    // Repo has heads/ but no active head.json (e.g. stale / rotated)
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'side-quest', { id: 'side-quest', desc: 'active side work' });

    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'target', path: repoDir }],
    }));

    const fleet = loadFleetContext(compilerDir);
    const repo = fleet.repos[0];
    expect(repo.activeDAGs).toHaveLength(1);
    expect(repo.activeDAGs[0].dagId).toBe('side-quest');
  });

  it('activeDAGs is empty when repo has no heads/ and no head.json', () => {
    // repoDir with no .roadmap at all
    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'empty', path: repoDir }],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos[0].activeDAGs).toEqual([]);
  });

  it('does not include completed heads/ DAGs in activeDAGs', () => {
    mkdirSync(join(repoDir, '.roadmap'), { recursive: true });
    const headsDir = makeHeadsDir(repoDir);
    writeHead(headsDir, 'old', {
      id: 'old',
      _lineage: { completedAt: '2025-12-31T23:59:59Z' },
    });

    writeFileSync(join(compilerDir, '.roadmap', 'fleet.json'), JSON.stringify({
      compiler: '.',
      repos: [{ name: 'repo', path: repoDir }],
    }));

    const fleet = loadFleetContext(compilerDir);
    expect(fleet.repos[0].activeDAGs).toEqual([]);
  });
});

// --- FleetFrontierNode type shape ---

describe('FleetFrontierNode schema', () => {
  it('validates a well-formed frontier node', () => {
    const node: FleetFrontierNode = {
      repo: 'my-service',
      dagId: 'build-v2',
      nodeId: 'compile-assets',
      produces: ['dist/bundle.js', 'dist/bundle.css'],
    };
    const parsed = FleetFrontierNodeSchema.parse(node);
    expect(parsed.repo).toBe('my-service');
    expect(parsed.dagId).toBe('build-v2');
    expect(parsed.nodeId).toBe('compile-assets');
    expect(parsed.produces).toHaveLength(2);
  });

  it('requires repo, dagId, nodeId, and produces', () => {
    expect(() => FleetFrontierNodeSchema.parse({})).toThrow();
    expect(() => FleetFrontierNodeSchema.parse({ repo: 'x', dagId: 'y', nodeId: 'z' })).toThrow();
  });

  it('accepts empty produces array', () => {
    const node = { repo: 'r', dagId: 'd', nodeId: 'n', produces: [] };
    expect(() => FleetFrontierNodeSchema.parse(node)).not.toThrow();
  });
});
