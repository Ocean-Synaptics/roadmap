// @module llm-feedback
// @exports buildFeedbackContext, generateFeedback, enrichAgentBrief, formatFeedbackMarkdown
// @types FeedbackContext, FeedbackPrompt, AgentBriefEnrichment
// @entry roadmap

import { MetricsExtractor, type MetricsSummary, type BatchMetrics } from './metrics-extractor.ts';
import type { AuditEntry, AuditSession } from './lib/audit/trail.ts';
import type { Brief } from './lib/brief.ts';
import { join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// -- Types --

export interface FeedbackContext {
  metrics: {
    successRate: number;
    completionVelocity: number;
    validatorHitRate: Record<string, number>;
    batchDurations: number[];
  };
  audit: {
    recentDecisions: AuditEntry[];
    rollbacks: AuditEntry[];
    failures: AuditEntry[];
  };
  conformance?: {
    unmappedScenarios: string[];
    partialCoverage: string[];
    conformant: boolean;
  };
}

export interface FeedbackPrompt {
  summary: string;
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  priority: 'critical' | 'high' | 'normal' | 'low';
}

export interface AgentBriefEnrichment {
  feedbackSection: string;
  contextualHints: string[];
  avoidPatterns: string[];
}

// -- Context Builder --

export function buildFeedbackContext(repoRoot: string): FeedbackContext {
  // Metrics from trail
  const trailPaths = [
    join(repoRoot, '.roadmap', 'trail.jsonl'),
  ];
  const globalTrail = join(process.env.HOME ?? '~', '.roadmap', 'trail.jsonl');
  if (existsSync(globalTrail)) trailPaths.push(globalTrail);

  const extractor = MetricsExtractor.fromFiles(...trailPaths);
  const summary = extractor.summary();

  const batchDurations = summary.batches
    .map((b: BatchMetrics) => b.durationMs)
    .filter((d: number) => d > 0);

  // Validator hit rates from node metrics
  const validatorHitRate: Record<string, number> = {};
  for (const node of summary.nodes) {
    for (const cmd of node.commands) {
      validatorHitRate[cmd] = (validatorHitRate[cmd] || 0) + 1;
    }
  }

  // Audit entries from .roadmap/audit/*.json
  const auditDir = join(repoRoot, '.roadmap', 'audit');
  const auditEntries = loadAuditEntries(auditDir);

  const failures = auditEntries.filter(e => e.status === 'failed');
  const rollbacks = auditEntries.filter(e => e.status === 'skipped');
  const recent = auditEntries.slice(-20);

  // Conformance: optional, loaded if spec-conformance results exist
  const conformance = loadConformanceResults(repoRoot);

  return {
    metrics: {
      successRate: summary.successRate,
      completionVelocity: summary.avgCompletionVelocity,
      validatorHitRate,
      batchDurations,
    },
    audit: {
      recentDecisions: recent,
      rollbacks,
      failures,
    },
    conformance,
  };
}

// -- Feedback Generator --

export function generateFeedback(ctx: FeedbackContext): FeedbackPrompt {
  const strengths: string[] = [];
  const improvements: string[] = [];
  const suggestions: string[] = [];
  let maxSeverity: FeedbackPrompt['priority'] = 'low';

  // Success rate analysis
  if (ctx.metrics.successRate >= 0.95) {
    strengths.push(`High reliability: ${(ctx.metrics.successRate * 100).toFixed(1)}% success rate`);
  } else if (ctx.metrics.successRate >= 0.8) {
    strengths.push(`Acceptable success rate: ${(ctx.metrics.successRate * 100).toFixed(1)}%`);
  } else {
    improvements.push(`Low success rate: ${(ctx.metrics.successRate * 100).toFixed(1)}% (target: 80%+)`);
    suggestions.push('Review recent failures and add defensive validation before node completion');
    maxSeverity = escalate(maxSeverity, 'high');
  }

  // Rollback analysis
  if (ctx.audit.rollbacks.length > 2) {
    improvements.push(`${ctx.audit.rollbacks.length} rollbacks detected — system instability`);
    suggestions.push('Investigate rollback causes; consider adding pre-validation checks');
    maxSeverity = escalate(maxSeverity, 'high');
  } else if (ctx.audit.rollbacks.length === 0 && ctx.audit.recentDecisions.length > 0) {
    strengths.push('No rollbacks in recent sessions');
  }

  // Failure pattern detection
  const failureCounts = countByNode(ctx.audit.failures);
  for (const [nodeId, count] of Object.entries(failureCounts)) {
    if (count >= 3) {
      improvements.push(`Persistent failure on "${nodeId}" (${count} times)`);
      suggestions.push(`Decompose "${nodeId}" into smaller steps or add prerequisite validation`);
      maxSeverity = escalate(maxSeverity, 'critical');
    }
  }

  // Velocity analysis
  if (ctx.metrics.batchDurations.length >= 3) {
    const recent = ctx.metrics.batchDurations.slice(-3);
    const older = ctx.metrics.batchDurations.slice(-6, -3);
    if (older.length >= 2) {
      const recentAvg = avg(recent);
      const olderAvg = avg(older);
      if (recentAvg > olderAvg * 1.5) {
        improvements.push('Completion velocity declining — recent batches taking 50%+ longer');
        suggestions.push('Check for dependency bottlenecks or scope creep in current batch');
        maxSeverity = escalate(maxSeverity, 'normal');
      } else if (recentAvg < olderAvg * 0.7) {
        strengths.push('Completion velocity improving — batches completing faster');
      }
    }
  }

  // Conformance analysis
  if (ctx.conformance) {
    if (ctx.conformance.conformant && ctx.conformance.unmappedScenarios.length === 0) {
      strengths.push('Full spec conformance — all scenarios mapped and passing');
    } else {
      if (ctx.conformance.unmappedScenarios.length > 0) {
        improvements.push(`${ctx.conformance.unmappedScenarios.length} unmapped spec scenarios`);
        suggestions.push(`Map scenarios to nodes: ${ctx.conformance.unmappedScenarios.slice(0, 3).join(', ')}`);
        maxSeverity = escalate(maxSeverity, 'high');
      }
      if (ctx.conformance.partialCoverage.length > 0) {
        improvements.push(`${ctx.conformance.partialCoverage.length} scenarios with partial coverage`);
        suggestions.push('Add validation rules for partially-covered scenarios');
      }
    }
  }

  // Fallback: if nothing detected, system is healthy
  if (strengths.length === 0 && improvements.length === 0) {
    strengths.push('System operating normally — no anomalies detected');
    maxSeverity = 'low';
  }

  const summary = buildSummary(strengths, improvements, maxSeverity);

  return { summary, strengths, improvements, suggestions, priority: maxSeverity };
}

// -- Brief Enrichment --

export function enrichAgentBrief(brief: Brief, ctx: FeedbackContext): AgentBriefEnrichment {
  const feedback = generateFeedback(ctx);
  const feedbackSection = formatFeedbackMarkdown(feedback);

  const contextualHints: string[] = [];
  const avoidPatterns: string[] = [];

  // Hints from failures relevant to this node's position
  for (const failure of ctx.audit.failures) {
    if (brief.consumes.some(c => failure.artifacts?.some(a => a.path === c))) {
      contextualHints.push(`Upstream artifact "${failure.nodeId}" had failures — verify inputs`);
    }
  }

  // Hints from velocity
  if (ctx.metrics.completionVelocity > 0 && ctx.metrics.completionVelocity < 1) {
    contextualHints.push('Low velocity detected — focus on smallest deliverable first');
  }

  // Anti-patterns from audit
  const failedValidators = new Set<string>();
  for (const f of ctx.audit.failures) {
    if (f.validation && !f.validation.passed) {
      failedValidators.add(f.validation.type);
    }
  }
  for (const v of failedValidators) {
    avoidPatterns.push(`Validator "${v}" has failed before — ensure compliance before completion`);
  }

  // Rollback patterns
  if (ctx.audit.rollbacks.length > 0) {
    const rollbackNodes = ctx.audit.rollbacks.map(r => r.nodeId);
    avoidPatterns.push(`Nodes ${rollbackNodes.slice(0, 3).join(', ')} required rollback — avoid similar patterns`);
  }

  // Default hints if none generated
  if (contextualHints.length === 0) {
    contextualHints.push('No upstream issues detected');
  }

  return { feedbackSection, contextualHints, avoidPatterns };
}

// -- Markdown Formatter --

export function formatFeedbackMarkdown(feedback: FeedbackPrompt): string {
  const lines: string[] = [];
  lines.push(`## Feedback [${feedback.priority.toUpperCase()}]`);
  lines.push('');
  lines.push(feedback.summary);
  lines.push('');

  if (feedback.strengths.length > 0) {
    lines.push('### Strengths');
    for (const s of feedback.strengths) lines.push(`- ${s}`);
    lines.push('');
  }

  if (feedback.improvements.length > 0) {
    lines.push('### Improvements');
    for (const i of feedback.improvements) lines.push(`- ${i}`);
    lines.push('');
  }

  if (feedback.suggestions.length > 0) {
    lines.push('### Suggestions');
    for (const s of feedback.suggestions) lines.push(`- ${s}`);
    lines.push('');
  }

  return lines.join('\n');
}

// -- Internal Helpers --

function loadAuditEntries(auditDir: string): AuditEntry[] {
  if (!existsSync(auditDir)) return [];
  const files = readdirSync(auditDir).filter(f => f.endsWith('.json')).sort();
  const entries: AuditEntry[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(auditDir, file), 'utf-8');
      const session: AuditSession = JSON.parse(raw);
      if (session.entries) entries.push(...session.entries);
    } catch { /* skip corrupt files */ }
  }
  return entries;
}

function loadConformanceResults(repoRoot: string): FeedbackContext['conformance'] | undefined {
  const conformancePath = join(repoRoot, '.roadmap', 'conformance.json');
  if (!existsSync(conformancePath)) return undefined;
  try {
    const raw = readFileSync(conformancePath, 'utf-8');
    return JSON.parse(raw);
  } catch { return undefined; }
}

function countByNode(entries: AuditEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.nodeId] = (counts[e.nodeId] || 0) + 1;
  }
  return counts;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const SEVERITY_ORDER: FeedbackPrompt['priority'][] = ['low', 'normal', 'high', 'critical'];

function escalate(current: FeedbackPrompt['priority'], candidate: FeedbackPrompt['priority']): FeedbackPrompt['priority'] {
  const ci = SEVERITY_ORDER.indexOf(current);
  const ni = SEVERITY_ORDER.indexOf(candidate);
  return ni > ci ? candidate : current;
}

function buildSummary(strengths: string[], improvements: string[], priority: FeedbackPrompt['priority']): string {
  if (improvements.length === 0) {
    return `System healthy: ${strengths.length} positive signals detected.`;
  }
  return `${improvements.length} issue(s) found (${priority}): ${improvements[0]}${improvements.length > 1 ? ` (+${improvements.length - 1} more)` : ''}.`;
}
