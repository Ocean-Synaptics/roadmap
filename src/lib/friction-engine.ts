// @module friction-engine
// @exports computeFriction, FrictionResult, FrictionClassification, FrictionMetrics, FRICTION_WEIGHTS
// @types FrictionResult, FrictionClassification, FrictionMetrics
// @entry roadmap

import type { TranscriptSession } from './transcript-schema.ts';

export interface FrictionMetrics {
  toolEntropy: number;
  retryRate: number;
  crossIndexContamination: number;
  bypassUsage: number;
  headDrift: number;
  expansionChurn: number;
}

export type FrictionClassification =
  | 'index-contamination'
  | 'high-retry'
  | 'bypass-usage'
  | 'tool-entropy'
  | 'head-drift'
  | 'expansion-churn'
  | 'clean';

export interface FrictionResult {
  sessionId: string;
  frictionScore: number;
  metrics: FrictionMetrics;
  classifications: FrictionClassification[];
}

export const FRICTION_WEIGHTS = {
  toolEntropy: 0.2,
  retryRate: 0.3,
  crossIndexContamination: 0.25,
  bypassUsage: 0.1,
  headDrift: 0.1,
  expansionChurn: 0.05,
} as const;

const HEAD_DRIFT_GAP_MS = 60_000;

export function computeFriction(session: TranscriptSession): FrictionResult {
  const totalCalls = session.toolCalls.length;

  // Tool entropy: unique tools / total calls (0 if no calls)
  const uniqueTools = new Set(session.toolCalls.map(tc => tc.tool)).size;
  const toolEntropy = totalCalls > 0 ? uniqueTools / totalCalls : 0;

  // Retry rate: sum of retry counts / total calls
  const totalRetries = session.retries.reduce((sum, r) => sum + r.count, 0);
  const retryRate = totalCalls > 0 ? totalRetries / totalCalls : 0;

  // Cross-index contamination: contamination events / total calls
  const contaminationCount = session.crossWorkerContaminationEvents.length;
  const crossIndexContamination = totalCalls > 0 ? contaminationCount / totalCalls : 0;

  // Bypass usage: absolute count
  const bypassUsage = session.bypassFlagsUsed.length;

  // Head drift: any batch gap > 60s OR any contamination events
  const hasLargeGap = session.timeBetweenBatchesMs.some(gap => gap > HEAD_DRIFT_GAP_MS);
  const headDrift = (hasLargeGap || contaminationCount > 0) ? 1 : 0;

  // Expansion churn: orphaned attempts / total calls
  const orphanedCount = session.orphanedAttempts.length;
  const expansionChurn = totalCalls > 0 ? orphanedCount / totalCalls : 0;

  const metrics: FrictionMetrics = {
    toolEntropy,
    retryRate,
    crossIndexContamination,
    bypassUsage,
    headDrift,
    expansionChurn,
  };

  // Weighted sum — bypassUsage scaled to 0–1 via min(count/5, 1)
  const frictionScore = Math.min(1, Math.max(0,
    toolEntropy * FRICTION_WEIGHTS.toolEntropy +
    retryRate * FRICTION_WEIGHTS.retryRate +
    crossIndexContamination * FRICTION_WEIGHTS.crossIndexContamination +
    Math.min(bypassUsage / 5, 1) * FRICTION_WEIGHTS.bypassUsage +
    headDrift * FRICTION_WEIGHTS.headDrift +
    expansionChurn * FRICTION_WEIGHTS.expansionChurn
  ));

  // Classifications
  const classifications: FrictionClassification[] = [];
  if (crossIndexContamination > 0) classifications.push('index-contamination');
  if (retryRate > 0.2) classifications.push('high-retry');
  if (bypassUsage > 0) classifications.push('bypass-usage');
  if (toolEntropy > 0.5) classifications.push('tool-entropy');
  if (headDrift > 0) classifications.push('head-drift');
  if (expansionChurn > 0.1) classifications.push('expansion-churn');
  if (classifications.length === 0) classifications.push('clean');

  return {
    sessionId: session.sessionId,
    frictionScore,
    metrics,
    classifications,
  };
}
