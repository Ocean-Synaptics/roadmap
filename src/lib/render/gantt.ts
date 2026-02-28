// @module render/gantt
// @exports buildGanttChart, renderGantt

import { parallelOrder } from '../../protocol.ts';
import type { Graph } from '../../protocol.ts';
import type { GanttChart, GanttEntry, RunId, InteractionReceipt } from '../metaflow/types.ts';
import type { RenderOpts } from './types.ts';

/**
 * Build a GanttChart from a DAG graph + optional receipt timing data.
 * Primary structure comes from parallelOrder() (batch levels, deps).
 * Receipts enrich with actual latency if stepId prefix matches nodeId.
 */
export function buildGanttChart(
  g: Graph<string>,
  runId: RunId,
  receipts: InteractionReceipt[] = []
): GanttChart {
  const batches = parallelOrder(g);
  const entries: GanttEntry[] = [];

  for (let batchLevel = 0; batchLevel < batches.length; batchLevel++) {
    for (const nodeId of batches[batchLevel]) {
      const node = (g.nodes as Record<string, { deps: readonly string[] }>)[nodeId];
      const deps = node?.deps ? [...node.deps] : [];

      // Find receipt with matching stepId prefix
      const receipt = receipts.find(r => r.stepId.startsWith(nodeId) || r.stepId === nodeId);

      const entry: GanttEntry = {
        nodeId,
        batchLevel,
        deps,
      };

      if (receipt) {
        entry.endOffset = receipt.evidence.latencyMs;
      }

      entries.push(entry);
    }
  }

  return {
    schema_version: 1,
    runId,
    entries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Render a GanttChart as ASCII.
 * Each batch level is a row group. Node bars proportional to latency (or unit width if no data).
 */
export function renderGantt(chart: GanttChart, opts: RenderOpts): string {
  const maxLevel = Math.max(...chart.entries.map(e => e.batchLevel), 0);
  const BAR_CHAR = '#';
  const UNIT_BAR = BAR_CHAR.repeat(4);
  const maxLatency = Math.max(...chart.entries.map(e => e.endOffset ?? 0), 1);
  const maxBarWidth = 20;

  const lines: string[] = [];
  const width = opts.width ?? 120;

  // Header
  lines.push('-'.repeat(width));
  lines.push('  Gantt');
  lines.push(`  Batches: L00-L${String(maxLevel).padStart(2, '0')}  Nodes: ${chart.entries.length}`);
  lines.push('-'.repeat(width));

  // Group entries by batch level
  for (let level = 0; level <= maxLevel; level++) {
    const batchEntries = chart.entries.filter(e => e.batchLevel === level);
    lines.push(`  L${String(level).padStart(2, '0')}  [${batchEntries.map(e => e.nodeId).join(', ')}]`);
    for (const entry of batchEntries) {
      const label = entry.nodeId.padEnd(35);
      let bar: string;
      if (entry.endOffset != null) {
        const barLen = Math.max(1, Math.round((entry.endOffset / maxLatency) * maxBarWidth));
        bar = BAR_CHAR.repeat(barLen) + ` ${entry.endOffset}ms`;
      } else {
        bar = UNIT_BAR + ' (no timing)';
      }
      lines.push(`      ${label} ${bar}`);
    }
  }

  lines.push('-'.repeat(width));
  return lines.join('\n');
}
