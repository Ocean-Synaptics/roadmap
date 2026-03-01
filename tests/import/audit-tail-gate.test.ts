import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateAuditTail, isAuditTailPresent } from '../../src/lib/import/audit-tail-gate.ts';
import type { AuditContract } from '../../src/lib/metaflow/audit/required-schema.ts';
import type { Graph } from '../../src/protocol.ts';

const contract: AuditContract = {
  schema_version: 1,
  version: '1.0.0',
  thresholds: { latencyP95MaxMs: 5000, toolCallInflationMax: 10, orientChurnMax: 3 },
  requiredDetectors: ['RD-001'],
  requiredTerminalNodeId: 'intent-metaflow-audit-required',
  bindFields: ['treeSha', 'sessionIds', 'runId'],
};

function makeGraph(nodeIds: string[]): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const id of nodeIds) {
    nodes[id] = {
      id,
      desc: `node ${id}`,
      produces: [],
      consumes: [],
      deps: id === nodeIds[0] ? [] : [nodeIds[0]],
      validate: [],
      idempotent: true,
    };
  }
  return {
    id: 'test-dag',
    desc: 'test',
    init: nodeIds[0],
    term: nodeIds[nodeIds.length - 1],
    nodes,
  } as Graph<string>;
}

describe('audit-tail-gate', () => {
  it('passes on graph with matching terminal node', () => {
    const g = makeGraph(['init', 'work', 'intent-metaflow-audit-required']);
    const result = validateAuditTail(g, contract);
    expect(result.passed).toBe(true);
    expect(result.code).toBe('AUDIT_TERMINAL_PRESENT');
    expect(result.evidence[0]).toContain('intent-metaflow-audit-required');
  });

  it('fails AUDIT_TERMINAL_MISSING on graph without', () => {
    const g = makeGraph(['init', 'work', 'done']);
    const result = validateAuditTail(g, contract);
    expect(result.passed).toBe(false);
    expect(result.code).toBe('AUDIT_TERMINAL_MISSING');
    expect(result.fix[0]).toContain('audit-tail emit');
  });

  it('isAuditTailPresent true with matching node', () => {
    const g = makeGraph(['init', 'intent-metaflow-audit-required']);
    expect(isAuditTailPresent(g)).toBe(true);
  });

  it('isAuditTailPresent false without', () => {
    const g = makeGraph(['init', 'done']);
    expect(isAuditTailPresent(g)).toBe(false);
  });

  it('passes with intent-metaflow-audit-required as terminal', () => {
    const g = makeGraph(['init', 'middle', 'intent-metaflow-audit-required']);
    const result = validateAuditTail(g, contract);
    expect(result.passed).toBe(true);
  });

  it('passes with pattern match intent-metaflow-audit-*', () => {
    const g = makeGraph(['init', 'intent-metaflow-audit-custom']);
    const altContract = { ...contract, requiredTerminalNodeId: 'some-other-id' };
    const result = validateAuditTail(g, altContract);
    expect(result.passed).toBe(true);
    expect(result.evidence[0]).toContain('intent-metaflow-audit-custom');
  });
});
