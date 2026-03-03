// implement-team-group: Team group routing validation tests
// Asserts: team group help displays all subcommands (claim, dispatch, strategy, assign)

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', 'bin', 'roadmap.ts');
const cwd = join(import.meta.dirname, '..');

function run(args: string, opts?: { expectFail?: boolean }): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node --experimental-strip-types ${CLI} ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

describe('team group routing', () => {
  it('team help exits 0 with help text', () => {
    const { stdout, exitCode } = run('team help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Multi-agent coordination');
    expect(stdout).toContain('Subcommands:');
  });

  it('team --help exits 0 with help text', () => {
    const { stdout, exitCode } = run('team --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Multi-agent coordination');
  });

  it('team help displays claim subcommand', () => {
    const { stdout } = run('team help');
    expect(stdout).toContain('claim');
  });

  it('team help displays dispatch subcommand', () => {
    const { stdout } = run('team help');
    expect(stdout).toContain('dispatch');
  });

  it('team help displays strategy subcommand', () => {
    const { stdout } = run('team help');
    expect(stdout).toContain('strategy');
  });

  it('team help displays assign subcommand', () => {
    const { stdout } = run('team help');
    expect(stdout).toContain('assign');
  });

  it('unknown team subcommand exits 1 with error', () => {
    const { exitCode, stdout } = run('team nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.message).toContain('Unknown team subcommand');
  });

  it('team help contains examples', () => {
    const { stdout } = run('team help');
    expect(stdout).toContain('Examples:');
    expect(stdout).toContain('roadmap team');
  });

  it('TypeScript compilation succeeds', () => {
    const { exitCode } = run('help'); // Any command to verify bin compiles
    expect(exitCode).toBe(0);
  });
});
