// Gantt chart builder + ASCII renderer tests

import { describe, it, expect } from 'vitest';
import { graph } from '../src/protocol.ts';
import { buildGanttChart, renderGantt } from '../src/lib/render/gantt.ts';
import type { RunId, InteractionReceipt, StepId } from '../src/lib/metaflow/types.ts';
import type { RenderOpts } from '../src/lib/render/types.ts';

const RUN_ID = 'run-test-001' as RunId;
const OPTS: RenderOpts = { tty: false, width: 80, color: false, emoji: false };

function diamond() {
  return graph({
    id: 'diamond',
    desc: 'init -> {a, b} -> term',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [] },
      a:    { id: 'a',    desc: 'left',  produces: ['a.txt'],    consumes: ['init.txt'], deps: ['init'] },
      b:    { id: 'b',    desc: 'right', produces: ['b.txt'],    consumes: ['init.txt'], deps: ['init'] },
      term: { id: 'term', desc: 'end',   produces: [],           consumes: ['a.txt', 'b.txt'], deps: ['a', 'b'] },
    },
  });
}

function makeReceipt(stepId: string, latencyMs: number): InteractionReceipt {
  return {
    schema_version: 1,
    runId: RUN_ID,
    stepId: stepId as StepId,
    cmd: 'test',
    intent: 'test',
    audience: 'agent',
    render: { plainPath: '', ansiPath: '', width: 80, emoji: false, color: false },
    evidence: { headSha: 'abc123', toolCalls: 1, latencyMs },
  };
}

describe('buildGanttChart', () => {
  it('produces entries for all nodes in batch order', () => {
    const g = diamond();
    const chart = buildGanttChart(g, RUN_ID);

    expect(chart.schema_version).toBe(1);
    expect(chart.runId).toBe(RUN_ID);
    expect(chart.entries.length).toBe(4);

    // init at level 0, a+b at level 1, term at level 2
    const initEntry = chart.entries.find(e => e.nodeId === 'init');
    expect(initEntry?.batchLevel).toBe(0);

    const aEntry = chart.entries.find(e => e.nodeId === 'a');
    const bEntry = chart.entries.find(e => e.nodeId === 'b');
    expect(aEntry?.batchLevel).toBe(1);
    expect(bEntry?.batchLevel).toBe(1);

    const termEntry = chart.entries.find(e => e.nodeId === 'term');
    expect(termEntry?.batchLevel).toBe(2);
  });

  it('captures deps from node spec', () => {
    const g = diamond();
    const chart = buildGanttChart(g, RUN_ID);
    const termEntry = chart.entries.find(e => e.nodeId === 'term')!;
    expect(termEntry.deps).toContain('a');
    expect(termEntry.deps).toContain('b');
  });

  it('enriches with receipt latency when stepId matches', () => {
    const g = diamond();
    const receipts = [makeReceipt('a', 150), makeReceipt('b', 300)];
    const chart = buildGanttChart(g, RUN_ID, receipts);

    expect(chart.entries.find(e => e.nodeId === 'a')?.endOffset).toBe(150);
    expect(chart.entries.find(e => e.nodeId === 'b')?.endOffset).toBe(300);
    expect(chart.entries.find(e => e.nodeId === 'init')?.endOffset).toBeUndefined();
  });

  it('matches receipt by stepId prefix', () => {
    const g = diamond();
    const receipts = [makeReceipt('a.sub-step', 200)];
    const chart = buildGanttChart(g, RUN_ID, receipts);
    expect(chart.entries.find(e => e.nodeId === 'a')?.endOffset).toBe(200);
  });

  it('sets generatedAt as ISO string', () => {
    const g = diamond();
    const chart = buildGanttChart(g, RUN_ID);
    expect(new Date(chart.generatedAt).toISOString()).toBe(chart.generatedAt);
  });
});

describe('renderGantt', () => {
  it('produces ASCII output with batch headers', () => {
    const g = diamond();
    const chart = buildGanttChart(g, RUN_ID);
    const output = renderGantt(chart, OPTS);

    expect(output).toContain('Gantt');
    expect(output).toContain('L00');
    expect(output).toContain('L01');
    expect(output).toContain('L02');
    expect(output).toContain('Nodes: 4');
  });

  it('shows timing bars when receipts present', () => {
    const g = diamond();
    const receipts = [makeReceipt('a', 500)];
    const chart = buildGanttChart(g, RUN_ID, receipts);
    const output = renderGantt(chart, OPTS);

    expect(output).toContain('500ms');
    expect(output).toContain('(no timing)');
  });

  it('uses configurable width for separator lines', () => {
    const g = diamond();
    const chart = buildGanttChart(g, RUN_ID);
    const output = renderGantt(chart, { ...OPTS, width: 60 });
    const lines = output.split('\n');
    expect(lines[0]).toBe('-'.repeat(60));
  });
});
