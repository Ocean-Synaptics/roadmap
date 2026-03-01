// @module validator-argv
// @exports ArgvValidationRule, isArgvRule, runArgvValidator, toArgv, isArgvCommand, shellescape
// @types ArgvCommand, ArgvValidationRule, ArgvValidatorResult
// @entry roadmap

import { spawnSync } from 'node:child_process';

/** A shell-injection-free command specified as argv array. */
export type ArgvCommand = string[];

/** Shell validation rule using argv array — no shell interpolation. */
export type ArgvValidationRule = {
  type: 'shell';
  argv: string[];
  expectExitCode?: number;
};

export interface ArgvValidatorResult {
  pass: boolean;
  exitCode: number;
  output: string;
  stderr: string;
  durationMs: number;
}

/** Returns true if a shell ValidationRule uses argv (not a command string). */
export function isArgvRule(rule: { argv?: string[]; command?: string | string[] }): rule is { argv: string[] } {
  return Array.isArray(rule.argv) && rule.argv.length > 0;
}

/** Returns true if command is an argv array (not a shell string). */
export function isArgvCommand(command: string | string[]): command is string[] {
  return Array.isArray(command);
}

/** Convert a shell string to argv (best-effort, simple space split — prefer native argv arrays). */
export function toArgv(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

/** Escape a single argument for shell embedding. Wraps in single quotes, escapes internal quotes. */
export function shellescape(arg: string): string {
  if (arg === '') return "''";
  if (!/[^a-zA-Z0-9@%+=:,./-]/.test(arg)) return arg;
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Execute a shell validation rule specified as argv array.
 * Uses spawnSync directly — no shell, no injection surface.
 */
export function runArgvValidator(
  rule: ArgvValidationRule,
  cwd?: string,
  env?: Record<string, string>,
): ArgvValidatorResult {
  const start = performance.now();
  const [bin, ...args] = rule.argv;

  const proc = spawnSync(bin, args, {
    cwd: cwd ?? process.cwd(),
    env: env ?? process.env as Record<string, string>,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  const durationMs = Math.round(performance.now() - start);
  const exitCode = proc.status ?? 1;
  const expected = rule.expectExitCode ?? 0;

  return {
    pass: exitCode === expected,
    exitCode,
    output: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    durationMs,
  };
}
