// @module import/audit-tail-gate
// @exports validateAuditTail, isAuditTailPresent

import type { Graph } from '../../protocol.ts';
import type { AuditContract } from '../metaflow/audit/required-schema.ts';

export interface AuditTailResult {
  passed: boolean;
  code: string;
  fix: string[];
  evidence: string[];
}

export function validateAuditTail(g: Graph<string>, contract: AuditContract): AuditTailResult {
  const nodeIds = Object.keys(g.nodes);
  const requiredId = contract.requiredTerminalNodeId;
  const pattern = /^intent-metaflow-audit-/;

  const hasExact = nodeIds.includes(requiredId);
  const hasPattern = nodeIds.some(id => pattern.test(id));

  if (hasExact || hasPattern) {
    const matchedId = hasExact ? requiredId : nodeIds.find(id => pattern.test(id))!;
    return {
      passed: true,
      code: 'AUDIT_TERMINAL_PRESENT',
      fix: [],
      evidence: [`terminal audit node found: ${matchedId}`],
    };
  }

  return {
    passed: false,
    code: 'AUDIT_TERMINAL_MISSING',
    fix: [`roadmap mf audit-tail emit --dag ${g.id}`],
    evidence: [`no node matching "${requiredId}" or pattern intent-metaflow-audit-* in graph (${nodeIds.length} nodes)`],
  };
}

export function isAuditTailPresent(g: Graph<string>): boolean {
  const nodeIds = Object.keys(g.nodes);
  return nodeIds.some(id => /^intent-metaflow-audit-/.test(id));
}
