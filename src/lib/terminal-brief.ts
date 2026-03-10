// @module terminal-brief
// @description Aggregates context layers into a TerminalBrief for terminal advance
// @exports TerminalBrief, HandoffSummary, buildTerminalBrief
// @entry roadmap/terminal-brief

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../protocol.ts';
import type { ChainLink, ExecutionReport } from './chain.ts';
import { loadChainFromHeads, getRootIntent } from './chain.ts';
import { computeReport } from './terminal-audit/computed.ts';
import type { ComputedReport } from './terminal-audit/computed.ts';
import { detectGaps } from './terminal-audit/detected.ts';
import type { DetectedGaps } from './terminal-audit/detected.ts';
import { computeTrailMetrics, type TrailMetrics } from './trail-metrics.ts';
import { CompletionStore } from '../runtime/completion.ts';
import { computeGapTrajectory } from './convergence/gap-trajectory.ts';
import { assessConvergence, type ConvergenceAssessment } from './convergence/assessment.ts';

export interface TerminalBrief {
  rootIntent: string;
  iteration: number;
  chainHistory: ChainLink[];
  completionEvidence: ComputedReport;
  handoffSummaries: HandoffSummary[];
  detectedGaps: DetectedGaps;
  executionReport?: ExecutionReport;
  /** Trail-derived scoring: velocity, batch duration, session metrics */
  scoring?: TrailMetrics;
  /** Convergence assessment: trend, persistent gaps, recommendation */
  convergence?: ConvergenceAssessment;
}

export interface HandoffSummary {
  nodeId: string;
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: string;
}

/**
 * Build a TerminalBrief aggregating context layers.
 * Called during terminal node advance or orient-time enrichment
 * to give agents full context for writing successor specs.
 */
export function buildTerminalBrief(
  dag: Graph<string>,
  repoRoot: string,
  executionReport?: ExecutionReport,
): TerminalBrief {
  // Layer 1: completion evidence (per-node commit status, test results, audit trail)
  const completionEvidence = computeReport(dag, repoRoot);

  // Layer 2: handoff journals
  const handoffSummaries = loadHandoffSummaries(repoRoot);

  // Layer 3: chain history (from heads/*.json _lineage fields)
  const chainHistory = loadChainFromHeads(repoRoot);
  const iteration = chainHistory.length > 0
    ? Math.max(...chainHistory.map(l => l.iteration)) + 1
    : 0;
  let rootIntent: string;
  try {
    rootIntent = getRootIntent(repoRoot);
  } catch {
    // First iteration — use current DAG desc
    rootIntent = dag.desc;
  }

  // Layer 5: trail-derived scoring (best-effort — undefined if trail.jsonl missing)
  let scoring: TrailMetrics | undefined;
  try {
    scoring = computeTrailMetrics(repoRoot);
  } catch {
    // Best-effort: don't crash if trail metrics computation fails
  }

  // Layer 4: gap detection (structural + scoring-derived)
  let completion: CompletionStore | undefined;
  try {
    completion = CompletionStore.loadOrEmpty(repoRoot);
  } catch {
    // Best-effort: don't crash if completion store missing
  }
  const detectedGaps = detectGaps(dag, { completion, scoring });

  // Layer 5: convergence assessment (best-effort)
  let convergence: ConvergenceAssessment | undefined;
  try {
    const trajectory = computeGapTrajectory(repoRoot);
    convergence = assessConvergence(trajectory, detectedGaps, executionReport);
    // Auto-populate deltaAssessment on the execution report
    if (executionReport && convergence) {
      executionReport.deltaAssessment = convergence.iterationSummary;
    }
  } catch {
    // Best-effort: don't crash if trajectory computation fails
  }

  return {
    rootIntent,
    iteration,
    chainHistory,
    completionEvidence,
    handoffSummaries,
    detectedGaps,
    executionReport,
    scoring,
    convergence,
  };
}

// --- Helpers ---

function loadHandoffSummaries(repoRoot: string): HandoffSummary[] {
  const handoffDir = join(repoRoot, '.roadmap', '.handoff');
  if (!existsSync(handoffDir)) return [];

  const summaries: HandoffSummary[] = [];
  const files = readdirSync(handoffDir).filter(f => f.endsWith('.json') && !f.includes('-interim-'));

  for (const file of files) {
    try {
      const content = JSON.parse(readFileSync(join(handoffDir, file), 'utf-8'));
      if (content.summary) {
        summaries.push({
          nodeId: file.replace('.json', ''),
          summary: content.summary,
          keyDecisions: content.keyDecisions ?? [],
          gotchas: content.gotchas ?? [],
          timestamp: content.timestamp ?? '',
        });
      }
    } catch {
      // Skip malformed handoff files
    }
  }

  return summaries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
