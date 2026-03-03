import { describe, it, expect, beforeEach } from 'vitest';
import { validateDAGEditAuthorization, validateCompletionClaim, validateCommitAttribution, recordBlockedMutation } from '../src/lib/enforce';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), 'enforce-test-' + Math.random().toString(36).slice(2));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  const dag = {
    id: 'test-dag',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
      'task-a': { id: 'task-a', desc: 'task', produces: ['out.json'], consumes: [], deps: ['init'], validate: [] },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['task-a'], validate: [] },
    },
  };
  writeFileSync(join(tmpDir, '.roadmap', 'head.json'), JSON.stringify(dag));
});

describe('validateDAGEditAuthorization', () => {
  it('allows feature branches to edit DAG files', () => {
    const result = validateDAGEditAuthorization(tmpDir, 'feat/task-a', ['.roadmap/head.json']);
    expect(result.allowed).toBe(true);
  });

  it('blocks main branch from editing DAG files', () => {
    const result = validateDAGEditAuthorization(tmpDir, 'main', ['.roadmap/head.json']);
    expect(result.allowed).toBe(false);
  });

  it('passes when no DAG files are staged', () => {
    const result = validateDAGEditAuthorization(tmpDir, 'main', ['src/lib/foo.ts']);
    expect(result.allowed).toBe(true);
  });
});

describe('validateCompletionClaim', () => {
  it('rejects missing artifacts', () => {
    const result = validateCompletionClaim(tmpDir, 'task-a');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('out.json');
  });

  it('accepts when artifacts exist', () => {
    writeFileSync(join(tmpDir, 'out.json'), '{}');
    const result = validateCompletionClaim(tmpDir, 'task-a');
    expect(result.allowed).toBe(true);
  });

  it('rejects unknown node', () => {
    const result = validateCompletionClaim(tmpDir, 'nonexistent');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not found');
  });
});

describe('validateCommitAttribution', () => {
  it('accepts roadmap: prefix', () => {
    const result = validateCommitAttribution('roadmap: phase update', []);
    expect(result.allowed).toBe(true);
  });

  it('accepts node ID reference', () => {
    const result = validateCommitAttribution('task-a: implement output', ['task-a', 'init', 'term']);
    expect(result.allowed).toBe(true);
  });

  it('rejects unattributed message', () => {
    const result = validateCommitAttribution('fix stuff', ['task-a']);
    expect(result.allowed).toBe(false);
  });
});

describe('recordBlockedMutation', () => {
  it('appends to enforcement trail', () => {
    recordBlockedMutation(tmpDir, {
      ts: '2026-03-03T00:00:00Z',
      rule: 'test-rule',
      branch: 'main',
      files: ['head.json'],
      reason: 'test block',
    });

    const trailPath = join(tmpDir, '.roadmap', 'enforcement-trail.jsonl');
    expect(existsSync(trailPath)).toBe(true);
    const content = readFileSync(trailPath, 'utf-8');
    expect(content).toContain('test-rule');
  });
});
