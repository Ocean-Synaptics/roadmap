import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runVerify } from '../src/lib/verify.ts';
import type { Violation, VerifyResult } from '../src/lib/verify.ts';

function makeTmp(): string {
  const dir = join(tmpdir(), `verify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeDAG(root: string, dag: object) {
  const roadmapDir = join(root, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify(dag, null, 2));
}

const minimalDAG = {
  id: 'test',
  desc: 'test dag',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
    term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'], validate: [] },
  },
};

describe('runVerify', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmp();
  });

  it('returns NO_DAG when head.json missing', () => {
    const result = runVerify(root);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('NO_DAG');
  });

  it('returns DAG_PARSE_ERROR for invalid JSON', () => {
    const roadmapDir = join(root, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });
    writeFileSync(join(roadmapDir, 'head.json'), '{invalid');
    const result = runVerify(root);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].code).toBe('DAG_PARSE_ERROR');
  });

  it('passes for a valid minimal DAG', () => {
    writeDAG(root, minimalDAG);
    const result = runVerify(root);
    expect(result.violations).toHaveLength(0);
  });

  it('detects structural errors (missing init)', () => {
    writeDAG(root, { ...minimalDAG, init: 'missing' });
    const result = runVerify(root);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations.some(v => v.code === 'STRUCTURAL_INVALID')).toBe(true);
  });

  it('detects orphan completions', () => {
    writeDAG(root, minimalDAG);
    const completions = [{ nodeId: 'ghost-node', completedAt: new Date().toISOString() }];
    writeFileSync(join(root, '.roadmap', 'completed.json'), JSON.stringify(completions));
    const result = runVerify(root);
    expect(result.warnings.some(w => w.code === 'ORPHAN_COMPLETIONS')).toBe(true);
    expect(result.warnings.find(w => w.code === 'ORPHAN_COMPLETIONS')!.nodeIds).toContain('ghost-node');
  });

  it('no warnings when completions match DAG nodes', () => {
    writeDAG(root, minimalDAG);
    const completions = [{ nodeId: 'init', completedAt: new Date().toISOString() }];
    writeFileSync(join(root, '.roadmap', 'completed.json'), JSON.stringify(completions));
    const result = runVerify(root);
    expect(result.warnings).toHaveLength(0);
  });

  it('exit code: violations produce non-empty fix array', () => {
    writeDAG(root, { ...minimalDAG, init: 'missing' });
    const result = runVerify(root);
    expect(result.fix.length).toBeGreaterThan(0);
  });

  it('exit code: clean DAG produces empty fix array', () => {
    writeDAG(root, minimalDAG);
    const result = runVerify(root);
    expect(result.fix).toHaveLength(0);
  });
});
