// @module convergence/assessment
// @description Synthesize gap trajectory + execution report into a ConvergenceAssessment
// @exports ConvergenceAssessment, assessConvergence

import type { GapTrajectory } from './gap-trajectory.ts';
import type { GapEntry, DetectedGaps } from '../terminal-audit/detected.ts';
import type { ExecutionReport } from '../chain.ts';

export interface ConvergenceAssessment {
  trend: 'converging' | 'stable' | 'diverging';
  reductionRate: number;
  persistentGaps: GapEntry[];
  resolvedThisIteration: GapEntry[];
  newThisIteration: GapEntry[];
  recommendation: string;
  iterationSummary: string;
}

/**
 * Assess convergence from gap trajectory, current gaps, and optional execution report.
 *
 * Produces a concrete recommendation sentence and a one-line iteration summary
 * suitable for deltaAssessment in ExecutionReport.
 */
export function assessConvergence(
  trajectory: GapTrajectory,
  currentGaps: DetectedGaps,
  executionReport?: ExecutionReport,
): ConvergenceAssessment {
  const { trend, reductionRate, persistent, resolved, new: newGaps, iterations } = trajectory;

  const currentIteration = iterations.length > 0
    ? iterations[iterations.length - 1].iteration
    : 0;

  // Derive the highest-count gap type from current gaps
  const typeCounts = new Map<string, number>();
  for (const gap of currentGaps.gaps) {
    typeCounts.set(gap.type, (typeCounts.get(gap.type) ?? 0) + 1);
  }
  const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topTypes = sortedTypes.slice(0, 3).map(([t]) => t);
  const topTypesStr = topTypes.join(', ');

  // Build recommendation
  const recommendation = buildRecommendation(
    trend, reductionRate, currentIteration,
    persistent, newGaps, currentGaps.gaps,
    topTypesStr,
  );

  // Build iteration summary
  const nodesExecuted = executionReport?.nodesExecuted ?? 0;
  const duration = executionReport?.totalDuration ?? 0;
  const iterationSummary = `Iteration ${currentIteration}: ${nodesExecuted} nodes in ${duration}ms, ${resolved.length} gaps resolved, ${newGaps.length} new, ${persistent.length} persistent`;

  return {
    trend,
    reductionRate,
    persistentGaps: persistent,
    resolvedThisIteration: resolved,
    newThisIteration: newGaps,
    recommendation,
    iterationSummary,
  };
}

function buildRecommendation(
  trend: 'converging' | 'stable' | 'diverging',
  reductionRate: number,
  iteration: number,
  persistent: GapEntry[],
  newGaps: GapEntry[],
  allGaps: GapEntry[],
  topTypesStr: string,
): string {
  const ratePercent = Math.round(Math.abs(reductionRate) * 100);

  if (trend === 'converging') {
    if (persistent.length > 0) {
      const persistentTypes = [...new Set(persistent.map(g => g.type))].join(', ');
      return `Gap surface shrinking ${ratePercent}% per iteration \u2014 ${persistent.length} persistent gaps (${persistentTypes}) need targeted validators`;
    }
    return `Gap surface shrinking ${ratePercent}% per iteration \u2014 all remaining gaps are new or resolved`;
  }

  if (trend === 'diverging') {
    const newTypes = [...new Set(newGaps.map(g => g.type))].join(', ');
    const strategy = newGaps.length > 3
      ? 'scope reduction before next iteration'
      : 'targeted validators for new gap types';
    return `Diverging after iteration ${iteration} \u2014 ${newGaps.length} new ${newTypes} gaps suggest ${strategy}`;
  }

  // Stable
  if (iteration === 0) {
    if (allGaps.length === 0) {
      return 'First iteration baseline \u2014 no gaps detected';
    }
    return `First iteration baseline \u2014 ${allGaps.length} gaps detected, focus on ${topTypesStr || 'coverage'}`;
  }

  if (allGaps.length === 0) {
    return 'Gap surface at zero \u2014 fully converged';
  }

  return `Gap surface unchanged at ${allGaps.length} \u2014 persistent gaps need different approach`;
}
