// implement-spec-group: Spec group routing validation tests
// Asserts: spec group help displays all subcommands (plan, import, intake, compile, init)

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

describe('spec group routing', () => {
  it('spec help exits 0 with help text', () => {
    const { stdout, exitCode } = run('spec help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Spec intake pipeline');
    expect(stdout).toContain('Subcommands:');
  });

  it('spec --help exits 0 with help text', () => {
    const { stdout, exitCode } = run('spec --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Spec intake pipeline');
  });

  it('spec help displays plan subcommand', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('plan');
  });

  it('spec help displays import subcommand', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('import');
  });

  it('spec help displays intake subcommand', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('intake');
  });

  it('spec help displays compile subcommand', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('compile');
  });

  it('spec help displays init subcommand', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('init');
  });

  it('unknown spec subcommand exits 1 with error', () => {
    const { exitCode, stdout } = run('spec nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.message).toContain('Unknown spec subcommand');
  });

  it('spec help contains examples', () => {
    const { stdout } = run('spec help');
    expect(stdout).toContain('Examples:');
    expect(stdout).toContain('roadmap spec');
  });

  it('TypeScript compilation succeeds', () => {
    const { exitCode } = run('help'); // Any command to verify bin compiles
    expect(exitCode).toBe(0);
  });
});
