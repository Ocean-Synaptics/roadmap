import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanActiveDAGs } from './fleet.ts';
import { saveCompletionWithEvidence } from './completion.ts';
import { sweepHeads } from '../lib/heads-sweep.ts';

const PASS = [{ rule: 'r', passed: true, evidence: 'ok' }];

function headPath(repo: string, dagId: string): string {
  return join(repo, '.roadmap', 'heads', `${dagId}.json`);
}

function writeHead(repo: string, dagId: string, nodeIds: string[]): void {
  const nodes: Record<string, unknown> = {};
  for (const id of nodeIds) nodes[id] = { id, desc: id };
  writeFileSync(headPath(repo, dagId), JSON.stringify({ id: dagId, desc: dagId, nodes }, null, 2));
}

describe('sweepHeads + scanActiveDAGs', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'roadmap-sweep-'));
    mkdirSync(join(repo, '.roadmap', 'heads'), { recursive: true });
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('stamps a complete head and shrinks the active set', () => {
    writeHead(repo, 'dag-done', ['a', 'b']);
    saveCompletionWithEvidence(repo, 'a', PASS, undefined, undefined, undefined, 'dag-done');
    saveCompletionWithEvidence(repo, 'b', PASS, undefined, undefined, undefined, 'dag-done');

    const before = scanActiveDAGs(repo);
    expect(before.map(d => d.dagId)).toContain('dag-done');

    const result = sweepHeads(repo);
    expect(result.swept).toContain('dag-done');

    const head = JSON.parse(readFileSync(headPath(repo, 'dag-done'), 'utf-8'));
    expect(head._lineage.completedAt).toBeTruthy();

    const after = scanActiveDAGs(repo);
    expect(after.map(d => d.dagId)).not.toContain('dag-done');
    expect(after.length).toBe(before.length - 1); // count shrinks — the real claim
  });

  it('does not stamp a head with an incomplete node; it stays active', () => {
    writeHead(repo, 'dag-partial', ['a', 'b']);
    saveCompletionWithEvidence(repo, 'a', PASS, undefined, undefined, undefined, 'dag-partial');
    // 'b' has no receipt

    const result = sweepHeads(repo);
    expect(result.swept).not.toContain('dag-partial');
    expect(result.skipped).toContain('dag-partial');

    const head = JSON.parse(readFileSync(headPath(repo, 'dag-partial'), 'utf-8'));
    expect(head._lineage?.completedAt).toBeUndefined();

    expect(scanActiveDAGs(repo).map(d => d.dagId)).toContain('dag-partial');
  });

  it('is idempotent — a second sweep does not change an already-stamped timestamp', () => {
    writeHead(repo, 'dag-done', ['a']);
    saveCompletionWithEvidence(repo, 'a', PASS, undefined, undefined, undefined, 'dag-done');

    sweepHeads(repo);
    const firstStamp = JSON.parse(readFileSync(headPath(repo, 'dag-done'), 'utf-8'))._lineage.completedAt;

    const second = sweepHeads(repo);
    expect(second.swept).not.toContain('dag-done');
    expect(second.skipped).toContain('dag-done');

    const secondStamp = JSON.parse(readFileSync(headPath(repo, 'dag-done'), 'utf-8'))._lineage.completedAt;
    expect(secondStamp).toBe(firstStamp);
  });
});
