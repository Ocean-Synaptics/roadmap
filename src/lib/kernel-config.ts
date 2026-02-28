// @module kernel-config
// @exports KernelConfig, loadKernel, DEFAULT_KERNEL
// @types KernelConfig, ComparatorPolicy, EnvPolicy, IntentPolicy
// @entry roadmap

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ComparatorPolicy {
  type: 'lexicographic';  // only supported type for now
}

export interface EnvPolicy {
  /** Env vars explicitly allowed in validator subprocesses (beyond builtin allowlist) */
  allowedVars: string[];
}

export interface IntentPolicy {
  minConfidence: number;       // 0.0–1.0, gate advancement
  escalateOnStall: boolean;    // escalate when convergence stalls
  maxRecursionDepth: number;   // hard recursion limit
}

export interface KernelConfig {
  schemaVersion: number;
  comparatorPolicy: ComparatorPolicy;
  envPolicy: EnvPolicy;
  intentPolicy: IntentPolicy;
  batchConflictPolicy: {
    /** 'reject' = hard gate (default), 'warn' = log only */
    onConflict: 'reject' | 'warn';
  };
}

export const DEFAULT_KERNEL: KernelConfig = {
  schemaVersion: 1,
  comparatorPolicy: { type: 'lexicographic' },
  envPolicy: { allowedVars: [] },
  intentPolicy: { minConfidence: 0.7, escalateOnStall: true, maxRecursionDepth: 3 },
  batchConflictPolicy: { onConflict: 'reject' },
};

export function loadKernel(repoRoot: string): KernelConfig {
  const path = join(repoRoot, '.roadmap', 'kernel.json');
  if (!existsSync(path)) return DEFAULT_KERNEL;
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<KernelConfig>;
  return { ...DEFAULT_KERNEL, ...raw };
}
