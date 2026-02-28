import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit, emitError, parseOutputOpts, ErrorCode, SCHEMA_VERSION, getHeadSha, getRepoRoot } from '../src/lib/cli-envelope.ts';

describe('cli-envelope', () => {
  let stdoutChunks: string[];
  const origWrite = process.stdout.write;

  beforeEach(() => {
    stdoutChunks = [];
    process.stdout.write = ((chunk: string) => { stdoutChunks.push(chunk); return true; }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = origWrite;
  });

  function lastOutput(): any {
    return JSON.parse(stdoutChunks.join(''));
  }

  describe('parseOutputOpts', () => {
    it('defaults to json format', () => {
      const opts = parseOutputOpts(['orient', '--note', 'test'], 'orient');
      expect(opts.format).toBe('json');
      expect(opts.quiet).toBe(false);
      expect(opts.cmd).toBe('orient');
    });

    it('--human sets human format', () => {
      const opts = parseOutputOpts(['--human', 'chart'], 'chart');
      expect(opts.format).toBe('human');
    });

    it('--json overrides --human', () => {
      const opts = parseOutputOpts(['--human', '--json'], 'orient');
      expect(opts.format).toBe('json');
    });

    it('--quiet flag captured', () => {
      const opts = parseOutputOpts(['--quiet'], 'orient');
      expect(opts.quiet).toBe(true);
    });
  });

  describe('emit', () => {
    it('wraps success in envelope with schema_version', () => {
      emit({ ok: true, cmd: 'orient', data: { position: ['a'] } }, { format: 'json', quiet: false });
      const out = lastOutput();
      expect(out.schema_version).toBe(SCHEMA_VERSION);
      expect(out.ok).toBe(true);
      expect(out.cmd).toBe('orient');
      expect(out.data).toEqual({ position: ['a'] });
      expect(out.repoRoot).toBeDefined();
    });

    it('wraps error in envelope', () => {
      emit({ ok: false, cmd: 'advance', error: { code: 'BATCH_INCOMPLETE', message: 'not done' } }, { format: 'json', quiet: false });
      const out = lastOutput();
      expect(out.ok).toBe(false);
      expect(out.error.code).toBe('BATCH_INCOMPLETE');
      expect(out.error.message).toBe('not done');
      expect(out.data).toBeUndefined();
    });

    it('suppresses output when quiet + ok', () => {
      emit({ ok: true, cmd: 'orient', data: {} }, { format: 'json', quiet: true });
      expect(stdoutChunks).toHaveLength(0);
    });

    it('does not suppress errors when quiet', () => {
      emit({ ok: false, cmd: 'orient', error: { code: 'X', message: 'y' } }, { format: 'json', quiet: true });
      expect(stdoutChunks.length).toBeGreaterThan(0);
    });

    it('uses humanRenderer when format=human and renderer provided', () => {
      emit(
        { ok: true, cmd: 'chart', data: { count: 5 } },
        { format: 'human', quiet: false, humanRenderer: (d: unknown) => `Count: ${(d as any).count}` },
      );
      expect(stdoutChunks.join('')).toBe('Count: 5\n');
    });

    it('falls back to JSON when format=human but no renderer', () => {
      emit({ ok: true, cmd: 'orient', data: { x: 1 } }, { format: 'human', quiet: false });
      const out = lastOutput();
      expect(out.schema_version).toBe(SCHEMA_VERSION);
      expect(out.data).toEqual({ x: 1 });
    });
  });

  describe('ErrorCode', () => {
    it('has expected error codes', () => {
      expect(ErrorCode.PLAN_NOT_SELECTED).toBe('PLAN_NOT_SELECTED');
      expect(ErrorCode.HEAD_SHA_MISMATCH).toBe('HEAD_SHA_MISMATCH');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.BATCH_INCOMPLETE).toBe('BATCH_INCOMPLETE');
    });
  });

  describe('getHeadSha', () => {
    it('returns string or null without throwing', () => {
      const result = getHeadSha();
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('getRepoRoot', () => {
    it('returns cwd', () => {
      expect(getRepoRoot()).toBe(process.cwd());
    });
  });
});
