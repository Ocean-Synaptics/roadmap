// JSONL ledger tests — collision survival, append-no-clobber, fold last-wins,
// legacy backward-compat. The collision case is THE claim: two records sharing
// a bare nodeId but differing in dagId must BOTH survive the load+filter.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CompletionStore,
  loadCompletionsWithEvidence,
  saveCompletionWithEvidence,
  type EvidenceRecord,
} from './completion.ts';

let tmpDir: string;
const pass: EvidenceRecord[] = [{ rule: 'r', passed: true, evidence: 'ok' }];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jsonl-ledger-'));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const jsonlPath = () => join(tmpDir, '.roadmap', 'completed.jsonl');

describe('collision — same nodeId, different dagId, BOTH survive', () => {
  it('filterByDagId isolates each round\'s record', () => {
    saveCompletionWithEvidence(tmpDir, 'init', pass, undefined, undefined, undefined, 'r5');
    saveCompletionWithEvidence(tmpDir, 'init', pass, undefined, undefined, undefined, 'r6');

    const store = CompletionStore.loadOrEmpty(tmpDir);
    const r5 = store.filterByDagId('r5');
    const r6 = store.filterByDagId('r6');

    // BOTH records survive — not mere file presence.
    expect(r5.hasPassing('init')).toBe(true);
    expect(r6.hasPassing('init')).toBe(true);
    expect(r5.record('init')?.dagId).toBe('r5');
    expect(r6.record('init')?.dagId).toBe('r6');

    // Raw load is composite-keyed: two distinct entries coexist.
    const raw = loadCompletionsWithEvidence(tmpDir);
    expect(raw.size).toBe(2);
  });
});

describe('append — no clobber', () => {
  it('saving B after A leaves A intact; file has >=2 lines; both load', () => {
    saveCompletionWithEvidence(tmpDir, 'alpha', pass, undefined, undefined, undefined, 'd');
    saveCompletionWithEvidence(tmpDir, 'beta', pass, undefined, undefined, undefined, 'd');

    const lines = readFileSync(jsonlPath(), 'utf-8').split('\n').filter(l => l.trim() !== '');
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const store = CompletionStore.loadOrEmpty(tmpDir).filterByDagId('d');
    expect(store.hasPassing('alpha')).toBe(true);
    expect(store.hasPassing('beta')).toBe(true);
  });
});

describe('fold — last line wins per composite', () => {
  it('later (dagId,nodeId) line overrides earlier', () => {
    const early = { nodeId: 'n', completedAt: '2020-01-01T00:00:00.000Z', dagId: 'd', owner: 'first' };
    const late = { nodeId: 'n', completedAt: '2021-01-01T00:00:00.000Z', dagId: 'd', owner: 'second' };
    writeFileSync(jsonlPath(), JSON.stringify(early) + '\n' + JSON.stringify(late) + '\n');

    const raw = loadCompletionsWithEvidence(tmpDir);
    expect(raw.size).toBe(1);
    const rec = CompletionStore.loadOrEmpty(tmpDir).filterByDagId('d').record('n');
    expect(rec?.owner).toBe('second');
  });

  it('malformed / partial final line is skipped silently', () => {
    const good = { nodeId: 'g', completedAt: '2021-01-01T00:00:00.000Z', dagId: 'd' };
    writeFileSync(jsonlPath(), JSON.stringify(good) + '\n{"nodeId":"partial",');
    const raw = loadCompletionsWithEvidence(tmpDir);
    expect(raw.size).toBe(1);
    expect(CompletionStore.loadOrEmpty(tmpDir).filterByDagId('d').hasRecord('g')).toBe(true);
  });
});

describe('backward-compat — legacy completed.json only', () => {
  it('repo with no jsonl still loads the array', () => {
    const legacy = [{ nodeId: 'old', completedAt: '2020-01-01T00:00:00.000Z', dagId: 'd' }];
    writeFileSync(join(tmpDir, '.roadmap', 'completed.json'), JSON.stringify(legacy));
    expect(existsSync(jsonlPath())).toBe(false);

    const store = CompletionStore.loadOrEmpty(tmpDir).filterByDagId('d');
    expect(store.hasPassing('old')).toBe(true);
  });

  it('jsonl wins over legacy json on key collision', () => {
    writeFileSync(
      join(tmpDir, '.roadmap', 'completed.json'),
      JSON.stringify([{ nodeId: 'x', completedAt: '2020-01-01T00:00:00.000Z', dagId: 'd', owner: 'legacy' }]),
    );
    writeFileSync(
      jsonlPath(),
      JSON.stringify({ nodeId: 'x', completedAt: '2021-01-01T00:00:00.000Z', dagId: 'd', owner: 'jsonl' }) + '\n',
    );
    const rec = CompletionStore.loadOrEmpty(tmpDir).filterByDagId('d').record('x');
    expect(rec?.owner).toBe('jsonl');
  });
});
