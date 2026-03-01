// @module cli/doctor-cli
// @exports renderCliCompliance, cmdDoctorCliCompliance

import { runComplianceAudit } from './audit-samples.ts';
import type { ComplianceResult } from './audit.ts';

export interface RenderOpts {
  color?: boolean;
}

export function renderCliCompliance(results: ComplianceResult[], _opts: RenderOpts = {}): string {
  const lines: string[] = [];

  lines.push('CLI Compliance Report');
  lines.push('');
  lines.push('Command              | State          | Evidence                          | Signals     | Invariant');
  lines.push('-------------------- | -------------- | --------------------------------- | ----------- | ---------');

  for (const r of results) {
    const cmd = r.tokens.join(' ').padEnd(20);
    const stateEmoji = r.state === 'COMPLIANT' ? 'COMPLIANT' : r.state === 'EXEMPT' ? 'EXEMPT   ' : 'NONCOMPL ';
    const evidence = (r.evidence[0] ?? '-').slice(0, 33).padEnd(33);
    const signals = '-'.padEnd(11);
    const invariant = r.failingInvariant ?? '-';
    lines.push(`${cmd} | ${stateEmoji.padEnd(14)} | ${evidence} | ${signals} | ${invariant}`);
  }

  lines.push('');

  // Progress bar
  const total = results.length;
  const compliant = results.filter(r => r.state === 'COMPLIANT' || r.state === 'EXEMPT').length;
  const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
  const barLen = 20;
  const filled = Math.round((compliant / Math.max(total, 1)) * barLen);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barLen - filled);
  lines.push(`[${bar}] ${pct}% (${compliant}/${total})`);
  lines.push('');

  const allPass = results.every(r => r.state !== 'NONCOMPLIANT');
  lines.push(allPass ? 'PASSED' : 'FAILED');

  return lines.join('\n');
}

export function cmdDoctorCliCompliance(opts: { base?: string } = {}): { data: any; render: string } {
  const base = opts.base ?? process.cwd();
  const results = runComplianceAudit('fast', base);
  const rendered = renderCliCompliance(results);

  return {
    data: {
      schema_version: 1,
      mode: 'fast',
      total: results.length,
      compliant: results.filter(r => r.state === 'COMPLIANT').length,
      exempt: results.filter(r => r.state === 'EXEMPT').length,
      noncompliant: results.filter(r => r.state === 'NONCOMPLIANT').length,
      results,
    },
    render: rendered,
  };
}
