import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  archiveHead,
  readArchivedLinks,
  getRootIntent,
  parseExecutionReport,
} from '../src/lib/chain.ts';
import type { ExecutionReport, Lineage } from '../src/lib/chain.ts';
import { buildTerminalBrief } from '../src/lib/terminal-brief.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// --- Helpers ---

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'chain-lifecycle-'));
}

function ensureRoadmapDir(root: string): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
}

function writeHead(root: string, content: Record<string, unknown>): void {
  ensureRoadmapDir(root);
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify(content, null, 2));
}

function makeLineage(overrides: Partial<Lineage> = {}): Lineage {
  return {
    iteration: 0,
    predecessorId: null,
    completedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function makeExecutionReport(overrides: Partial<ExecutionReport> = {}): ExecutionReport {
  return {
    nodesExecuted: 5,
    totalDuration: 12000,
    retriesPerNode: { 'node-a': 1, 'node-b': 0 },
    observations: ['All nodes completed', 'No blockers'],
    blockers: [],
    deltaAssessment: 'Full convergence achieved',
    ...overrides,
  };
}

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id,
      desc: 'test node',
      produces: [],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
      ...spec,
    };
  }
  return { id: 'test-dag', desc: 'Test DAG for lifecycle', init: 'init', term: 'term', nodes } as any;
}

// --- Tests ---

describe('archiveHead with _lineage', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archives head.json to heads/<dagId>.json with _lineage field', () => {
    writeHead(tmpDir, { id: 'test-dag', desc: 'test description' });
    const lineage = makeLineage({ iteration: 0, predecessorId: null });
    archiveHead(tmpDir, lineage);

    // head.json removed
    expect(existsSync(join(tmpDir, '.roadmap', 'head.json'))).toBe(false);

    // heads/test-dag.json exists with original content + _lineage
    const archivePath = join(tmpDir, '.roadmap', 'heads', 'test-dag.json');
    expect(existsSync(archivePath)).toBe(true);
    const archived = JSON.parse(readFileSync(archivePath, 'utf-8'));
    expect(archived.id).toBe('test-dag');
    expect(archived.desc).toBe('test description');
    expect(archived._lineage).toBeDefined();
    expect(archived._lineage.iteration).toBe(0);
    expect(archived._lineage.predecessorId).toBeNull();
    expect(archived._lineage.completedAt).toBe('2026-03-01T00:00:00Z');

    // head-index.json should NOT exist
    const indexPath = join(tmpDir, '.roadmap', 'head-index.json');
    expect(existsSync(indexPath)).toBe(false);
  });

  it('embeds executionReport in _lineage when provided', () => {
    writeHead(tmpDir, { id: 'dag-with-report', desc: 'test' });
    const report = makeExecutionReport({ tokensConsumed: 42000 });
    const lineage = makeLineage({ iteration: 1, predecessorId: 'prev-dag', executionReport: report });
    archiveHead(tmpDir, lineage);

    const archivePath = join(tmpDir, '.roadmap', 'heads', 'dag-with-report.json');
    const archived = JSON.parse(readFileSync(archivePath, 'utf-8'));
    expect(archived._lineage.executionReport).toBeDefined();
    expect(archived._lineage.executionReport.nodesExecuted).toBe(5);
    expect(archived._lineage.executionReport.tokensConsumed).toBe(42000);
    expect(archived._lineage.predecessorId).toBe('prev-dag');
  });

  it('second archiveHead archives both heads independently', () => {
    // First archive
    writeHead(tmpDir, { id: 'dag-alpha', desc: 'first' });
    archiveHead(tmpDir, makeLineage({ iteration: 0 }));

    // Second archive
    writeHead(tmpDir, { id: 'dag-beta', desc: 'second' });
    archiveHead(tmpDir, makeLineage({ iteration: 1, predecessorId: 'dag-alpha' }));

    expect(existsSync(join(tmpDir, '.roadmap', 'heads', 'dag-alpha.json'))).toBe(true);
    expect(existsSync(join(tmpDir, '.roadmap', 'heads', 'dag-beta.json'))).toBe(true);
    // head-index.json should NOT exist
    expect(existsSync(join(tmpDir, '.roadmap', 'head-index.json'))).toBe(false);
  });

  it('throws when head.json does not exist', () => {
    ensureRoadmapDir(tmpDir);
    expect(() => archiveHead(tmpDir, makeLineage())).toThrow(/No head\.json found/);
  });
});

describe('readArchivedLinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array when heads/ does not exist', () => {
    ensureRoadmapDir(tmpDir);
    expect(readArchivedLinks(tmpDir)).toEqual([]);
  });

  it('returns empty array when heads/ has no _lineage files', () => {
    const headsDir = join(tmpDir, '.roadmap', 'heads');
    mkdirSync(headsDir, { recursive: true });
    // File without _lineage
    writeFileSync(join(headsDir, 'old-dag.json'), JSON.stringify({ id: 'old-dag', desc: 'no lineage' }));
    expect(readArchivedLinks(tmpDir)).toEqual([]);
  });

  it('returns ChainLink array sorted by iteration', () => {
    writeHead(tmpDir, { id: 'dag-a', desc: 'first' });
    archiveHead(tmpDir, makeLineage({ iteration: 0, predecessorId: null }));

    writeHead(tmpDir, { id: 'dag-b', desc: 'second' });
    archiveHead(tmpDir, makeLineage({ iteration: 1, predecessorId: 'dag-a' }));

    const links = readArchivedLinks(tmpDir);
    expect(links).toHaveLength(2);
    expect(links[0].dagId).toBe('dag-a');
    expect(links[0].iteration).toBe(0);
    expect(links[1].dagId).toBe('dag-b');
    expect(links[1].iteration).toBe(1);
    expect(links[1].predecessorId).toBe('dag-a');
  });

  it('max iteration from links is correct', () => {
    writeHead(tmpDir, { id: 'dag-x', desc: 'first' });
    archiveHead(tmpDir, makeLineage({ iteration: 0 }));
    writeHead(tmpDir, { id: 'dag-y', desc: 'second' });
    archiveHead(tmpDir, makeLineage({ iteration: 3, predecessorId: 'dag-x' }));
    writeHead(tmpDir, { id: 'dag-z', desc: 'third' });
    archiveHead(tmpDir, makeLineage({ iteration: 1, predecessorId: 'dag-x' }));

    const links = readArchivedLinks(tmpDir);
    const maxIter = Math.max(...links.map(l => l.iteration));
    expect(maxIter).toBe(3);
  });
});

describe('getRootIntent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns current head.json desc when no archived heads exist', () => {
    writeHead(tmpDir, { id: 'current-dag', desc: 'Build the authentication system' });
    expect(getRootIntent(tmpDir)).toBe('Build the authentication system');
  });

  it('returns archived head desc for iteration 0 when heads exist', () => {
    // Archive the first head with iteration 0
    writeHead(tmpDir, { id: 'root-dag', desc: 'Original root intent' });
    archiveHead(tmpDir, makeLineage({ iteration: 0, predecessorId: null }));

    // Archive a successor
    writeHead(tmpDir, { id: 'successor-dag', desc: 'Successor intent' });
    archiveHead(tmpDir, makeLineage({ iteration: 1, predecessorId: 'root-dag' }));

    // getRootIntent should find iteration 0 and read its desc
    expect(getRootIntent(tmpDir)).toBe('Original root intent');
  });

  it('throws when no head.json and no archived heads', () => {
    ensureRoadmapDir(tmpDir);
    expect(() => getRootIntent(tmpDir)).toThrow(/No head\.json and no chain entries/);
  });
});

describe('parseExecutionReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses a valid ExecutionReport from file', () => {
    const report = makeExecutionReport({ tokensConsumed: 50000 });
    const filePath = join(tmpDir, 'report.json');
    writeFileSync(filePath, JSON.stringify(report));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.nodesExecuted).toBe(5);
    expect(parsed.totalDuration).toBe(12000);
    expect(parsed.retriesPerNode).toEqual({ 'node-a': 1, 'node-b': 0 });
    expect(parsed.observations).toEqual(['All nodes completed', 'No blockers']);
    expect(parsed.blockers).toEqual([]);
    expect(parsed.deltaAssessment).toBe('Full convergence achieved');
    expect(parsed.tokensConsumed).toBe(50000);
  });

  it('parses report without optional tokensConsumed', () => {
    const report = makeExecutionReport();
    const filePath = join(tmpDir, 'report.json');
    writeFileSync(filePath, JSON.stringify(report));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.tokensConsumed).toBeUndefined();
  });

  it('throws on missing required field (nodesExecuted)', () => {
    const filePath = join(tmpDir, 'bad.json');
    writeFileSync(filePath, JSON.stringify({
      totalDuration: 100,
      retriesPerNode: {},
      observations: [],
      blockers: [],
      deltaAssessment: 'ok',
    }));
    expect(() => parseExecutionReport(filePath)).toThrow(/nodesExecuted must be a number/);
  });

  it('throws on missing required field (observations not array)', () => {
    const filePath = join(tmpDir, 'bad2.json');
    writeFileSync(filePath, JSON.stringify({
      nodesExecuted: 1,
      totalDuration: 100,
      retriesPerNode: {},
      observations: 'not-an-array',
      blockers: [],
      deltaAssessment: 'ok',
    }));
    expect(() => parseExecutionReport(filePath)).toThrow(/observations must be an array/);
  });

  it('throws on non-existent file', () => {
    expect(() => parseExecutionReport(join(tmpDir, 'nope.json'))).toThrow(/file not found/);
  });
});

describe('buildTerminalBrief', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aggregates all six context layers', () => {
    // Set up: simple 2-node DAG
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });

    // Write head.json (for getRootIntent fallback)
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG for lifecycle' });

    // Write completed.json with completion records
    const completedPath = join(tmpDir, '.roadmap', 'completed.json');
    writeFileSync(completedPath, JSON.stringify([
      { nodeId: 'init', completedAt: '2026-03-01T00:00:00Z', validationChecks: [] },
    ]));

    // Write a handoff file
    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, 'init-setup.json'), JSON.stringify({
      summary: 'Initialized project structure',
      keyDecisions: ['Used TypeScript'],
      gotchas: ['Requires Node 20+'],
      timestamp: '2026-03-01T00:00:00Z',
    }));

    const brief = buildTerminalBrief(dag, tmpDir);

    // Layer 1: rootIntent
    expect(brief.rootIntent).toBe('Test DAG for lifecycle');

    // Layer 2: iteration
    expect(brief.iteration).toBe(0);

    // Layer 3: chainHistory
    expect(brief.chainHistory).toEqual([]);

    // Layer 4: completionEvidence (ComputedReport)
    expect(brief.completionEvidence.commitStatus).toBeDefined();
    expect(brief.completionEvidence.commitStatus.find(s => s.nodeId === 'init')).toBeDefined();

    // Layer 4b: detectedGaps
    expect(brief.detectedGaps).toBeDefined();
    expect(brief.detectedGaps.gaps).toBeInstanceOf(Array);

    // Layer 5: handoffSummaries
    expect(brief.handoffSummaries).toHaveLength(1);
    expect(brief.handoffSummaries[0].nodeId).toBe('init-setup');
    expect(brief.handoffSummaries[0].summary).toBe('Initialized project structure');
    expect(brief.handoffSummaries[0].keyDecisions).toEqual(['Used TypeScript']);
    expect(brief.handoffSummaries[0].gotchas).toEqual(['Requires Node 20+']);
  });

  it('reads chainHistory from heads/_lineage when archived heads exist', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });

    // Archive a predecessor head with _lineage
    writeHead(tmpDir, { id: 'pred-dag', desc: 'Predecessor DAG' });
    archiveHead(tmpDir, makeLineage({ iteration: 0, predecessorId: null }));

    // Current head
    writeHead(tmpDir, { id: 'test-dag', desc: 'Current DAG' });

    const brief = buildTerminalBrief(dag, tmpDir);
    expect(brief.chainHistory).toHaveLength(1);
    expect(brief.chainHistory[0].dagId).toBe('pred-dag');
    expect(brief.chainHistory[0].iteration).toBe(0);
    // iteration should be max(archived) + 1 = 1
    expect(brief.iteration).toBe(1);
  });

  it('excludes interim handoff files', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test' });

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, 'setup.json'), JSON.stringify({
      summary: 'Setup done',
      timestamp: '2026-03-01T00:00:00Z',
    }));
    // Interim file should be excluded (contains '-interim-' in name)
    writeFileSync(join(handoffDir, 'setup-interim-2026-03-01T00-00-00.json'), JSON.stringify({
      summary: 'Interim checkpoint',
      timestamp: '2026-03-01T00:30:00Z',
    }));

    const brief = buildTerminalBrief(dag, tmpDir);
    expect(brief.handoffSummaries).toHaveLength(1);
    expect(brief.handoffSummaries[0].nodeId).toBe('setup');
  });

  it('passes through executionReport when provided', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test' });

    const report = makeExecutionReport();
    const brief = buildTerminalBrief(dag, tmpDir, report);
    expect(brief.executionReport).toBeDefined();
    expect(brief.executionReport!.nodesExecuted).toBe(5);
  });
});

describe('ExecutionReport roundtrip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('write → parse preserves all fields', () => {
    const original = makeExecutionReport({ tokensConsumed: 75000 });
    const filePath = join(tmpDir, 'roundtrip.json');
    writeFileSync(filePath, JSON.stringify(original));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.nodesExecuted).toBe(original.nodesExecuted);
    expect(parsed.totalDuration).toBe(original.totalDuration);
    expect(parsed.retriesPerNode).toEqual(original.retriesPerNode);
    expect(parsed.tokensConsumed).toBe(original.tokensConsumed);
    expect(parsed.observations).toEqual(original.observations);
    expect(parsed.blockers).toEqual(original.blockers);
    expect(parsed.deltaAssessment).toBe(original.deltaAssessment);
  });

  it('roundtrip without optional tokensConsumed preserves undefined', () => {
    const original = makeExecutionReport();
    delete (original as any).tokensConsumed;
    const filePath = join(tmpDir, 'roundtrip-no-tokens.json');
    writeFileSync(filePath, JSON.stringify(original));

    const parsed = parseExecutionReport(filePath);
    expect(parsed.tokensConsumed).toBeUndefined();
  });
});
