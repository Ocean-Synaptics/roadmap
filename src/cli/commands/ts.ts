// @module cli/commands/ts
// @exports tsCommand
// @entry bin/cli.ts
// CLI: ts run --stdin, ts transform --stdin, ts typecheck --stdin
// Reads TypeScript from stdin, validates imports against allowlist, executes in sandbox.

import { executeSandboxed, typecheckCode, validateImports } from '../../lib/ts-sandbox.ts';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function jsonOut(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// --- subcommands ---

async function runCmd(useStdin: boolean): Promise<void> {
  if (!useStdin) {
    process.stderr.write('ts run requires --stdin\n');
    process.exit(1);
  }
  const code = await readStdin();
  const result = executeSandboxed(code);
  jsonOut(result);
  if (!result.ok || ('exitCode' in result && result.exitCode !== 0)) process.exit(1);
}

async function transformCmd(useStdin: boolean): Promise<void> {
  if (!useStdin) {
    process.stderr.write('ts transform requires --stdin\n');
    process.exit(1);
  }
  const code = await readStdin();
  // Transform = execute and capture output (same sandbox, output is the transformation result)
  const result = executeSandboxed(code);
  if (!result.ok) {
    jsonOut(result);
    process.exit(1);
  }
  // For transform, output stdout directly (not wrapped in JSON) — it IS the transformed data
  if ('stdout' in result && result.stdout) {
    process.stdout.write(result.stdout + '\n');
  }
  if ('exitCode' in result && result.exitCode !== 0) process.exit(1);
}

async function typecheckCmd(useStdin: boolean): Promise<void> {
  if (!useStdin) {
    process.stderr.write('ts typecheck requires --stdin\n');
    process.exit(1);
  }
  const code = await readStdin();
  const result = typecheckCode(code);
  jsonOut(result);
  if (!result.ok || ('exitCode' in result && result.exitCode !== 0)) process.exit(1);
}

// --- entry ---

export async function tsCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const useStdin = args.includes('--stdin');

  switch (subcommand) {
    case 'run':
      return runCmd(useStdin);
    case 'transform':
      return transformCmd(useStdin);
    case 'typecheck':
      return typecheckCmd(useStdin);
    default:
      process.stderr.write(
        `Usage: ts <run|transform|typecheck> --stdin\n` +
        `  run        Execute TS code, return JSON output\n` +
        `  transform  Apply transformation, output result\n` +
        `  typecheck  Check types without execution\n`,
      );
      process.exit(1);
  }
}
