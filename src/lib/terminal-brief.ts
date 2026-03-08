// @module terminal-brief
// @description Aggregates six context layers into a TerminalBrief for terminal advance
// @exports TerminalBrief, HandoffSummary, buildTerminalBrief
// @entry roadmap/terminal-brief

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../protocol.ts';
import type { ChainLink, ExecutionReport } from './chain.ts';
import { loadChain, currentIteration, getRootIntent } from './chain.ts';
import type { TerminalAuditContext } from './terminal-audit/validator.ts';
import { runAudit } from './terminal-audit/validator.ts';
import type { ComputedReport } from './terminal-audit/computed.ts';
import type { DetectionResult } from './terminal-audit/detected.ts';
import { loadCompletionsWithEvidence } from './evidence/completion-evidence.ts';
import type { CompletionRecordWithEvidence } from './evidence/completion-evidence.ts';

export interface TerminalBrief {
  rootIntent: string;
  iteration: number;
  chainHistory: ChainLink[];
  completionEvidence: Map<string, CompletionRecordWithEvidence>;
  handoffSummaries: HandoffSummary[];
  computedSummary: ComputedReport;
  executionReport?: ExecutionReport;
  detectedGaps: DetectionResult;
}

export interface HandoffSummary {
  nodeId: string;
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: string;
}

/**
 * Build a TerminalBrief aggregating all six context layers.
 * Called during terminal node advance to give the planning agent
 * full context for generating the successor spec.
 */
export function buildTerminalBrief(
  dag: Graph<string>,
  repoRoot: string,
  executionReport?: ExecutionReport,
): TerminalBrief {
  // Layer 1: completion evidence
  const completionEvidence = loadCompletionsWithEvidence(repoRoot);

  // Layer 2: handoff journals
  const handoffSummaries = loadHandoffSummaries(repoRoot);

  // Layer 3: computed audit summary
  const existsPredicate = (artifact: string) => existsSync(join(repoRoot, artifact));
  const auditContext = runAudit(dag, completionEvidence, existsPredicate, []);

  // Layer 4: chain history
  const chainHistory = loadChain(repoRoot);
  const iteration = currentIteration(repoRoot);
  let rootIntent: string;
  try {
    rootIntent = getRootIntent(repoRoot);
  } catch {
    // First iteration — use current DAG desc
    rootIntent = dag.desc;
  }

  // Layer 5: execution report (passed in from --evaluate-file)
  // Already provided as parameter

  // Layer 6: detected gaps (informational)
  const detectedGaps = auditContext.detected;

  return {
    rootIntent,
    iteration,
    chainHistory,
    completionEvidence,
    handoffSummaries,
    computedSummary: auditContext.computed,
    executionReport,
    detectedGaps,
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
