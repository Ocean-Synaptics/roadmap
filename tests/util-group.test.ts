// implement-util-group: Util group routing validation tests
// Asserts: util group help displays all subcommands (trail, checkpoint, install, federation)

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

describe('util group routing', () => {
  it('util help exits 0 with help text', () => {
    const { stdout, exitCode } = run('util help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Session utilities and introspection');
    expect(stdout).toContain('Subcommands:');
  });

  it('util --help exits 0 with help text', () => {
    const { stdout, exitCode } = run('util --help');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Session utilities and introspection');
  });

  it('util help displays trail subcommand', () => {
    const { stdout } = run('util help');
    expect(stdout).toContain('trail');
  });

  it('util help displays checkpoint subcommand', () => {
    const { stdout } = run('util help');
    expect(stdout).toContain('checkpoint');
  });

  it('util help displays install subcommand', () => {
    const { stdout } = run('util help');
    expect(stdout).toContain('install');
  });

  it('util help displays federation subcommand', () => {
    const { stdout } = run('util help');
    expect(stdout).toContain('federation');
  });

  it('unknown util subcommand exits 1 with error', () => {
    const { exitCode, stdout } = run('util nonexistent --note "test"', { expectFail: true });
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(false);
    expect(env.error.message).toContain('Unknown util subcommand');
  });

  it('util help contains examples', () => {
    const { stdout } = run('util help');
    expect(stdout).toContain('Examples:');
    expect(stdout).toContain('roadmap util');
  });

  it('TypeScript compilation succeeds', () => {
    const { exitCode } = run('help'); // Any command to verify bin compiles
    expect(exitCode).toBe(0);
  });
});
