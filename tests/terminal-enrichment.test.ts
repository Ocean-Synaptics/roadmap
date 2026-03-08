import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getBrief } from '../src/lib/brief.ts';
import { buildTerminalBrief } from '../src/lib/terminal-brief.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// --- Helpers ---

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'terminal-enrichment-'));
}

function ensureRoadmapDir(root: string): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
}

function writeHead(root: string, content: Record<string, unknown>): void {
  ensureRoadmapDir(root);
  writeFileSync(join(root, '.roadmap', 'head.json'), JSON.stringify(content, null, 2));
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
  return { id: 'test-dag', desc: 'Test DAG', init: 'init', term: 'term', nodes } as any;
}

// --- Tests ---

describe('terminal enrichment integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('orient returns terminalContext in brief when position is term node', async () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      middle: { produces: ['src/foo.ts'], consumes: ['init.marker'], deps: ['init'] },
      term: { consumes: ['src/foo.ts'], deps: ['middle'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });

    const brief = await getBrief(dag, 'term', tmpDir);
    expect(brief.terminalContext).toBeDefined();
    expect(brief.terminalContext!.rootIntent).toBe('Test DAG');
  });

  it('terminalContext includes completionEvidence with per-node status', async () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });
    writeFileSync(join(tmpDir, '.roadmap', 'completed.json'), JSON.stringify([
      { nodeId: 'init', completedAt: '2026-03-01T00:00:00Z', gitSha: 'abc123', validationChecks: [
        { rule: 'shell:pnpm run check', passed: true, evidence: 'exit 0' },
      ] },
    ]));

    const brief = await getBrief(dag, 'term', tmpDir);
    const evidence = brief.terminalContext!.completionEvidence;

    // commitStatus has per-node entries
    expect(evidence.commitStatus).toHaveLength(2); // init + term
    const initStatus = evidence.commitStatus.find(s => s.nodeId === 'init');
    expect(initStatus).toBeDefined();
    expect(initStatus!.gitSha).toBe('abc123');

    // testEvidence has shell results
    const initEvidence = evidence.testEvidence.find(e => e.nodeId === 'init');
    expect(initEvidence).toBeDefined();
    expect(initEvidence!.shellResults).toHaveLength(1);
    expect(initEvidence!.shellResults[0].passed).toBe(true);

    // auditTrail has check counts
    const initAudit = evidence.auditTrail.find(a => a.nodeId === 'init');
    expect(initAudit).toBeDefined();
    expect(initAudit!.checksTotal).toBe(1);
    expect(initAudit!.checksPassed).toBe(1);
    expect(initAudit!.checksFailed).toBe(0);
  });

  it('terminalContext includes detectedGaps with uncovered-consume and untested-produce types', async () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [], validate: [] },
      // middle produces src/foo.ts with no shell validator → uncovered for term's consume
      middle: { produces: ['src/foo.ts'], consumes: ['init.marker'], deps: ['init'], validate: [] },
      term: { consumes: ['src/foo.ts'], deps: ['middle'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });

    const brief = await getBrief(dag, 'term', tmpDir);
    const gaps = brief.terminalContext!.detectedGaps.gaps;

    // src/foo.ts is consumed by term but middle has no shell validator
    const uncovered = gaps.filter(g => g.type === 'uncovered-consume');
    expect(uncovered.length).toBeGreaterThan(0);
    expect(uncovered.some(g => g.artifact === 'src/foo.ts')).toBe(true);

    // init.marker and src/foo.ts are produced but no validator references them
    const untested = gaps.filter(g => g.type === 'untested-produce');
    expect(untested.length).toBeGreaterThan(0);
  });

  it('terminalContext includes handoffSummaries', async () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });

    const handoffDir = join(tmpDir, '.roadmap', '.handoff');
    mkdirSync(handoffDir, { recursive: true });
    writeFileSync(join(handoffDir, 'init.json'), JSON.stringify({
      summary: 'Init completed',
      keyDecisions: ['Used vitest'],
      gotchas: ['Needs Node 20'],
      timestamp: '2026-03-01T00:00:00Z',
    }));

    const brief = await getBrief(dag, 'term', tmpDir);
    expect(brief.terminalContext!.handoffSummaries).toHaveLength(1);
    expect(brief.terminalContext!.handoffSummaries[0].summary).toBe('Init completed');
  });

  it('non-terminal nodes do NOT get terminalContext', async () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      middle: { produces: ['src/foo.ts'], consumes: ['init.marker'], deps: ['init'] },
      term: { consumes: ['src/foo.ts'], deps: ['middle'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });

    const initBrief = await getBrief(dag, 'init', tmpDir);
    expect(initBrief.terminalContext).toBeUndefined();

    const middleBrief = await getBrief(dag, 'middle', tmpDir);
    expect(middleBrief.terminalContext).toBeUndefined();
  });

  it('buildTerminalBrief works with empty completed.json (fresh DAG)', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'], deps: [] },
      term: { consumes: ['init.marker'], deps: ['init'] },
    });
    writeHead(tmpDir, { id: 'test-dag', desc: 'Test DAG' });

    // No completed.json at all
    const brief = buildTerminalBrief(dag, tmpDir);
    expect(brief.rootIntent).toBe('Test DAG');
    expect(brief.completionEvidence.commitStatus).toHaveLength(2);
    expect(brief.completionEvidence.commitStatus.every(s => s.completedAt === undefined)).toBe(true);
    expect(brief.detectedGaps).toBeDefined();
    expect(brief.handoffSummaries).toEqual([]);
    expect(brief.chainHistory).toEqual([]);
    expect(brief.iteration).toBe(0);
  });
});
