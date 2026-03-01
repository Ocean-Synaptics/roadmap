import { describe, it, expect } from 'vitest';
import { renderCliCompliance, cmdDoctorCliCompliance } from '../../src/lib/cli/doctor-cli.ts';
import type { ComplianceResult } from '../../src/lib/cli/audit.ts';

const compliantResult: ComplianceResult = { id: 'orient', tokens: ['orient'], state: 'COMPLIANT', evidence: ['receipt present and ok'] };
const exemptResult: ComplianceResult = { id: 'help', tokens: ['help'], state: 'EXEMPT', evidence: ['exempt: plumbing'] };
const failResult: ComplianceResult = { id: 'bad', tokens: ['bad'], state: 'NONCOMPLIANT', evidence: ['missing receipt'], failingInvariant: 'MISSING_DISPLAY_RECEIPT' };

describe('doctor-cli', () => {
  it('renderCliCompliance produces table with | separators', () => {
    const out = renderCliCompliance([compliantResult, exemptResult]);
    expect(out).toContain('|');
    expect(out.split('\n').filter(l => l.includes('|')).length).toBeGreaterThan(2);
  });

  it('contains progress bar', () => {
    const out = renderCliCompliance([compliantResult]);
    expect(out).toMatch(/[█░]/);
  });

  it('FAILED banner when any NONCOMPLIANT', () => {
    const out = renderCliCompliance([compliantResult, failResult]);
    expect(out).toContain('FAILED');
  });

  it('PASSED banner when all compliant', () => {
    const out = renderCliCompliance([compliantResult, exemptResult]);
    expect(out).toContain('PASSED');
    expect(out).not.toContain('FAILED');
  });

  it('table includes invariant when failures present', () => {
    const out = renderCliCompliance([failResult]);
    expect(out).toContain('MISSING_DISPLAY_RECEIPT');
  });

  it('cmdDoctorCliCompliance emits schema_version:1', () => {
    // Will run with no commands.json — returns NONCOMPLIANT for _missing
    const { data } = cmdDoctorCliCompliance({ base: '/tmp/nonexistent-' + Date.now() });
    expect(data.schema_version).toBe(1);
    expect(typeof data.total).toBe('number');
  });
});
