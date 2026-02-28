// @module env-audit
// @exports runEnvAudit, EnvAuditResult, EnvAuditViolation, DEPRECATED_ENV_VARS, KERNEL_REPLACEMENTS
// @types EnvAuditResult, EnvAuditViolation, DeprecatedEnvVar
// @entry roadmap

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const DEPRECATED_ENV_VARS = [
  'SKIP_PLAN_GATE',
  'SKIP_BATCH_COMMIT',
  'ROADMAP_VALIDATING',
] as const;

export type DeprecatedEnvVar = typeof DEPRECATED_ENV_VARS[number];

export const KERNEL_REPLACEMENTS: Record<DeprecatedEnvVar, string> = {
  SKIP_PLAN_GATE: 'policy.skipPlanGate',
  SKIP_BATCH_COMMIT: 'policy.skipBatchCommit',
  ROADMAP_VALIDATING: 'policy.validating',
};

export interface EnvAuditViolation {
  envVar: string;
  value: string;
  kernelReplacement: string;
  fix: string;
}

export interface EnvAuditResult {
  pass: boolean;
  violations: EnvAuditViolation[];
  checkedAt: string;
  kernelJsonExists: boolean;
}

export function runEnvAudit(repoRoot: string): EnvAuditResult {
  const violations: EnvAuditViolation[] = [];

  for (const varName of DEPRECATED_ENV_VARS) {
    const value = process.env[varName];
    if (value != null && value !== '') {
      violations.push({
        envVar: varName,
        value,
        kernelReplacement: KERNEL_REPLACEMENTS[varName],
        fix: `Set ${KERNEL_REPLACEMENTS[varName]}: true in .roadmap/kernel.json instead`,
      });
    }
  }

  return {
    pass: violations.length === 0,
    violations,
    checkedAt: new Date().toISOString(),
    kernelJsonExists: existsSync(join(repoRoot, '.roadmap', 'kernel.json')),
  };
}
