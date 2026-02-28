// STATE-INTROSPECTION — tests for `roadmap status`, `roadmap remaining`,
// `roadmap doctor completion` commands. Exercises JSON output shapes,
// node counts, remaining list, and doctor diagnostics.

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

function parseData(stdout: string): any {
  const envelope = JSON.parse(stdout);
  return envelope.data ?? envelope;
}

// --- status ---

describe('roadmap status', () => {
  it('returns JSON with node counts', () => {
    const { stdout, exitCode } = run('status');
    expect(exitCode).toBe(0);
    const data = parseData(stdout);
    expect(data.dagId).toBeDefined();
    expect(typeof data.total).toBe('number');
    expect(typeof data.done).toBe('number');
    expect(typeof data.pending).toBe('number');
    expect(data.total).toBeGreaterThan(0);
  });

  it('done and pending are non-negative', () => {
    const { stdout } = run('status');
    const data = parseData(stdout);
    expect(data.done).toBeGreaterThanOrEqual(0);
    expect(data.pending).toBeGreaterThanOrEqual(0);
  });

  it('includes failed, skipped, planned counts', () => {
    const { stdout } = run('status');
    const data = parseData(stdout);
    expect(typeof data.failed).toBe('number');
    expect(typeof data.skipped).toBe('number');
    expect(typeof data.planned).toBe('number');
  });
});

// --- remaining ---

describe('roadmap remaining', () => {
  it('returns JSON list of remaining nodes with --json', () => {
    const { stdout, exitCode } = run('remaining --json');
    expect(exitCode).toBe(0);
    const data = parseData(stdout);
    expect(Array.isArray(data.remaining)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  it('each remaining node has id, mode, blockedBy, state', () => {
    const { stdout } = run('remaining --json');
    const data = parseData(stdout);
    if (data.remaining.length > 0) {
      const node = data.remaining[0];
      expect(typeof node.id).toBe('string');
      expect(typeof node.mode).toBe('string');
      expect(typeof node.blockedBy).toBe('string');
      expect(typeof node.state).toBe('string');
    }
  });

  it('count matches remaining array length', () => {
    const { stdout } = run('remaining --json');
    const data = parseData(stdout);
    expect(data.count).toBe(data.remaining.length);
  });
});

// --- doctor completion ---

describe('roadmap doctor completion', () => {
  it('returns JSON diagnostics with --json', () => {
    const { stdout, exitCode } = run('doctor completion --json');
    // Exit code 0 or 1 (1 if issues found)
    expect([0, 1]).toContain(exitCode);
    const data = parseData(stdout);
    expect(typeof data.nodeCount).toBe('number');
    expect(typeof data.completedCount).toBe('number');
    expect(typeof data.pendingCount).toBe('number');
  });

  it('includes stale, pending, failed, plan, skipped arrays', () => {
    const { stdout } = run('doctor completion --json');
    const data = parseData(stdout);
    expect(Array.isArray(data.stale)).toBe(true);
    expect(Array.isArray(data.pending)).toBe(true);
    expect(Array.isArray(data.failed)).toBe(true);
    expect(Array.isArray(data.plan)).toBe(true);
    expect(Array.isArray(data.skipped)).toBe(true);
  });

  it('has ok field and issues array', () => {
    const { stdout } = run('doctor completion --json');
    const data = parseData(stdout);
    expect(typeof data.ok).toBe('boolean');
    expect(Array.isArray(data.issues)).toBe(true);
  });

  it('doctor without subcommand returns error', () => {
    const { exitCode } = run('doctor', { expectFail: true });
    expect(exitCode).not.toBe(0);
  });
});
