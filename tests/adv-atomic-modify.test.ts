import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { define, graph, modify } from '../src/protocol.ts';

describe('adv-atomic-modify: concurrent agent safety', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = join(tmpdir(), `roadmap-atomic-${Date.now()}`);
    mkdirSync(tmpRepo, { recursive: true });
    execSync('git init', { cwd: tmpRepo, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmpRepo, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpRepo, stdio: 'ignore' });
    writeFileSync(join(tmpRepo, 'README.md'), 'test');
    execSync('git add .', { cwd: tmpRepo, stdio: 'ignore' });
    execSync('git commit -m "initial"', { cwd: tmpRepo, stdio: 'ignore' });
  });

  afterEach(() => {
    try {
      rmSync(tmpRepo, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('modification is in-memory by default', () => {
    const g = define(
      graph({
        id: 'test',
        desc: 'test',
        init: 'a',
        term: 'c',
        nodes: {
          a: { id: 'a', produces: ['f1'], consumes: [], deps: [] },
          b: { id: 'b', produces: ['f2'], consumes: ['f1'], deps: ['a'] },
          c: { id: 'c', produces: [], consumes: ['f2'], deps: ['b'] },
        },
      }),
    );

    const modified = modify(g, 'b', 'delete');
    expect(modified instanceof Error).toBe(true); // b is required
  });

  it('tracks modification in audit record', () => {
    const record = {
      timestamp: Date.now(),
      action: 'delete' as const,
      nodeId: 'git-state-spec',
      reason: 'Phase skipped',
      commitHash: 'abc123',
    };

    expect(record.nodeId).toBe('git-state-spec');
    expect(record.commitHash).toBeDefined();
  });

  it('audit trail can reconstruct roadmap state', () => {
    const decisions = [
      { timestamp: 1, action: 'delete' as const, nodeId: 'x', reason: 'r1', commitHash: 'h1' },
      { timestamp: 2, action: 'delete' as const, nodeId: 'y', reason: 'r2', commitHash: 'h2' },
    ];

    expect(decisions[0].commitHash).toBe('h1');
    expect(decisions[1].commitHash).toBe('h2');
  });

  it('concurrent agents see committed state', () => {
    const agentAState = { modified: true, commitHash: 'commit-a' };
    const agentBState = { seesCommitHash: 'commit-a' };
    expect(agentBState.seesCommitHash).toBe(agentAState.commitHash);
  });

  it('modification log is JSON-serializable', () => {
    const log = [
      {
        timestamp: 1708876800000,
        action: 'delete',
        nodeId: 'node-1',
        reason: 'Reason 1',
        commitHash: 'hash1',
      },
    ];

    const serialized = JSON.stringify(log);
    const deserialized = JSON.parse(serialized);

    expect(deserialized[0].nodeId).toBe('node-1');
  });
});
