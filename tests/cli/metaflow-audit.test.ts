import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditMetaflowCompliance, renderMetaflowAuditTable } from '../../src/lib/cli/audit-metaflow.ts';
import type { CommandEntry } from '../../src/lib/cli/inventory.ts';

describe('auditMetaflowCompliance', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mf-audit-'));
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/metaflow'), { recursive: true });
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  const orientEntry: CommandEntry = {
    id: 'orient', tokens: ['orient'], description: 'Batch position',
    flags: ['--note'], mustHaveDisplayReceipt: true, requiredSignals: [], examples: [],
  };

  const trailEntry: CommandEntry = {
    id: 'trail', tokens: ['trail'], description: 'Trail',
    flags: [], mustHaveDisplayReceipt: false, requiredSignals: [], examples: [],
    exempt: { exemptClass: 'plumbing', exemptReason: 'diagnostic only' },
  };

  const validateEntry: CommandEntry = {
    id: 'validate', tokens: ['validate'], description: 'Validate',
    flags: ['--note'], mustHaveDisplayReceipt: false, requiredSignals: [], examples: [],
  };

  function writeSelfInsert(cmd: string) {
    const id = `si-${cmd.replace(/\s+/g, '-')}`;
    writeFileSync(join(tmp, '.roadmap/receipts', `metaflow-self-insert-${id}.json`),
      JSON.stringify({ stepId: id, cmd }));
  }

  function writeSurface(cmd: string) {
    const id = `si-${cmd.replace(/\s+/g, '-')}`;
    writeFileSync(join(tmp, '.roadmap/receipts', `metaflow-surface-${id}.json`),
      JSON.stringify({ stepId: id, cmd }));
  }

  it('COMPLIANT on command with all receipts', () => {
    writeSelfInsert('orient');
    writeSurface('orient');
    const results = auditMetaflowCompliance([orientEntry], tmp);
    expect(results[0].state).toBe('COMPLIANT');
    expect(results[0].selfInsert).toBe(true);
    expect(results[0].header).toBe(true);
  });

  it('NONCOMPLIANT on missing self-insert', () => {
    writeSurface('orient');
    const results = auditMetaflowCompliance([orientEntry], tmp);
    expect(results[0].state).toBe('NONCOMPLIANT');
    expect(results[0].selfInsert).toBe(false);
  });

  it('NONCOMPLIANT on missing header', () => {
    writeSelfInsert('orient');
    const results = auditMetaflowCompliance([orientEntry], tmp);
    expect(results[0].state).toBe('NONCOMPLIANT');
    expect(results[0].header).toBe(false);
  });

  it('EXEMPT on exempt command', () => {
    const results = auditMetaflowCompliance([trailEntry], tmp);
    expect(results[0].state).toBe('EXEMPT');
  });

  it('zero noncompliant on proper fixture', () => {
    writeSelfInsert('orient');
    writeSurface('orient');
    // validate is in ELIGIBLE_COMMANDS — needs receipts to be COMPLIANT
    writeSelfInsert('validate');
    writeSurface('validate');
    const results = auditMetaflowCompliance([orientEntry, trailEntry, validateEntry], tmp);
    expect(results.filter(r => r.state === 'NONCOMPLIANT')).toHaveLength(0);
  });

  it('renders table with border chars', () => {
    const results = auditMetaflowCompliance([orientEntry], tmp);
    const table = renderMetaflowAuditTable(results);
    expect(table).toContain('━');
    expect(table).toContain('orient');
  });
});
