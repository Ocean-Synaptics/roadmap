// implement-dag-group: DAG group routing validation tests
// Asserts: dag group help displays all subcommands (diff, expand, propagate, retire, optimize, switch, spawn)

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

describe('dag group routing', () => {
  it('dag help exits 0 with help text', () => {
    const { stdout, exitCode } = run('dag help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('DAG structure and manipulation');
    expect(stdout).toContain('Subcommands:');
  });

  it('dag --help exits 0 with help text', () => {
    const { stdout, exitCode } = run('dag --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('DAG structure and manipulation');
  });

  it('dag help displays diff subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('diff');
  });

  it('dag help displays expand subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('expand');
  });

  it('dag help displays propagate subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('propagate');
  });

  it('dag help displays retire subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('retire');
  });

  it('dag help displays optimize subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('optimize');
  });

  it('dag help displays switch subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('switch');
  });

  it('dag help displays spawn subcommand', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('spawn');
  });

  it('unknown dag subcommand exits 1 with error', () => {
    const { exitCode, stdout } = run('dag nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.message).toContain('Unknown dag subcommand');
  });

  it('dag help contains examples', () => {
    const { stdout } = run('dag help');
    expect(stdout).toContain('Examples:');
    expect(stdout).toContain('roadmap dag');
  });

  it('TypeScript compilation succeeds', () => {
    const { exitCode } = run('help'); // Any command to verify bin compiles
    expect(exitCode).toBe(0);
  });
});
