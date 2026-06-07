import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateLedger } from './ledger-migrate.ts';

let root: string;

function legacy(records: object[]): void {
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'completed.json'), JSON.stringify(records, null, 2));
}

function jsonlLines(): string[] {
  const p = join(root, '.roadmap', 'completed.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8').split('\n').filter(l => l.trim() !== '');
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'ledger-migrate-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('migrateLedger', () => {
  it('migrates a legacy array to one jsonl line per record', () => {
    legacy([
      { nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', dagId: 'd1' },
      { nodeId: 'b', completedAt: '2026-01-02T00:00:00Z', dagId: 'd1' },
    ]);
    const res = migrateLedger(root);
    expect(res.migrated).toBe(2);
    const lines = jsonlLines();
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
    // each line is \n-terminated
    expect(readFileSync(res.jsonlPath, 'utf-8').endsWith('\n')).toBe(true);
  });

  it('is idempotent — twice yields identical jsonl, no dupes', () => {
    legacy([
      { nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', dagId: 'd1' },
      { nodeId: 'b', completedAt: '2026-01-02T00:00:00Z', dagId: 'd1' },
    ]);
    migrateLedger(root);
    const first = readFileSync(join(root, '.roadmap', 'completed.jsonl'), 'utf-8');
    const res2 = migrateLedger(root);
    const second = readFileSync(join(root, '.roadmap', 'completed.jsonl'), 'utf-8');
    expect(second).toBe(first);
    expect(res2.alreadyCurrent).toBe(true);
    expect(jsonlLines()).toHaveLength(2);
  });

  it('never deletes completed.json', () => {
    legacy([{ nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', dagId: 'd1' }]);
    migrateLedger(root);
    expect(existsSync(join(root, '.roadmap', 'completed.json'))).toBe(true);
  });

  it('folds by composite key — same nodeId across dags both survive', () => {
    legacy([
      { nodeId: 'init', completedAt: '2026-01-01T00:00:00Z', dagId: 'r5' },
      { nodeId: 'init', completedAt: '2026-01-02T00:00:00Z', dagId: 'r6' },
    ]);
    const res = migrateLedger(root);
    expect(res.migrated).toBe(2);
    const dagIds = jsonlLines().map(l => JSON.parse(l).dagId).sort();
    expect(dagIds).toEqual(['r5', 'r6']);
  });

  it('is a no-op success when already migrated (no legacy json)', () => {
    mkdirSync(join(root, '.roadmap'), { recursive: true });
    writeFileSync(
      join(root, '.roadmap', 'completed.jsonl'),
      JSON.stringify({ nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', dagId: 'd1' }) + '\n',
    );
    const res = migrateLedger(root);
    expect(res.alreadyCurrent).toBe(true);
    expect(jsonlLines()).toHaveLength(1);
  });
});
