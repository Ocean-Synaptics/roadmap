import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CommandInstrument,
  extractMfRun,
  type CommandExecution,
} from '../../src/lib/metaflow/command-instrumentation.ts';

describe('Metaflow command instrumentation', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mf-instrument-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- extractMfRun ---

  describe('extractMfRun', () => {
    it('extracts --mf-run and runId from args', () => {
      const { mfRunId, cleanArgs } = extractMfRun(['--note', 'test', '--mf-run', 'run-123']);
      expect(mfRunId).toBe('run-123');
      expect(cleanArgs).toEqual(['--note', 'test']);
    });

    it('returns undefined when --mf-run is absent', () => {
      const { mfRunId, cleanArgs } = extractMfRun(['--note', 'test']);
      expect(mfRunId).toBeUndefined();
      expect(cleanArgs).toEqual(['--note', 'test']);
    });

    it('handles --mf-run at end of args', () => {
      const { mfRunId, cleanArgs } = extractMfRun(['orient', '--mf-run', 'r1']);
      expect(mfRunId).toBe('r1');
      expect(cleanArgs).toEqual(['orient']);
    });

    it('handles --mf-run at start of args', () => {
      const { mfRunId, cleanArgs } = extractMfRun(['--mf-run', 'r1', 'orient']);
      expect(mfRunId).toBe('r1');
      expect(cleanArgs).toEqual(['orient']);
    });
  });

  // --- recordExecution ---

  describe('recordExecution', () => {
    it('captures command execution metrics', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('orient', ['--note', 'test'], 0, '{"ok": true}');

      expect(exec.cmd).toBe('orient');
      expect(exec.args).toEqual(['--note', 'test']);
      expect(exec.exitCode).toBe(0);
      expect(exec.outputSize).toBe('{"ok": true}'.length);
      expect(exec.durationMs).toBeGreaterThanOrEqual(0);
      expect(exec.timestamp).toBeTruthy();
    });

    it('classifies valid CLI envelope output', () => {
      const envelope = JSON.stringify({ schema_version: 1, ok: true, cmd: 'orient', repoRoot: '/tmp' });
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('orient', [], 0, envelope);

      expect(exec.outputStructure).toBe('envelope');
      expect(exec.envelopeOk).toBe(true);
    });

    it('classifies failed envelope output', () => {
      const envelope = JSON.stringify({ schema_version: 1, ok: false, cmd: 'orient', error: { code: 'X', message: 'y' } });
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('orient', [], 1, envelope);

      expect(exec.outputStructure).toBe('envelope');
      expect(exec.envelopeOk).toBe(false);
    });

    it('classifies plain JSON as json (not envelope)', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('test', [], 0, '{"foo": "bar"}');

      expect(exec.outputStructure).toBe('json');
      expect(exec.envelopeOk).toBeUndefined();
    });

    it('classifies mixed output as mixed', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('test', [], 1, 'Warning: something\n{"error": true}');

      expect(exec.outputStructure).toBe('mixed');
    });

    it('classifies plain text as text', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('help', [], 0, 'Commands:\n  orient\n  chart');

      expect(exec.outputStructure).toBe('text');
    });

    it('classifies empty output as text', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('quiet', [], 0, '');

      expect(exec.outputStructure).toBe('text');
    });

    it('captures error lines on non-zero exit code', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('fail', [], 1, 'line1\nError: something broke\nline3');

      expect(exec.errors).toBeDefined();
      expect(exec.errors).toContain('Error: something broke');
    });

    it('omits errors array on zero exit code', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('ok', [], 0, 'all good');

      expect(exec.errors).toBeUndefined();
    });

    it('strips --mf-run from recorded args', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('orient', ['--note', 'x', '--mf-run', 'r1'], 0, '{}');

      expect(exec.args).toEqual(['--note', 'x']);
      expect(exec.mfRunId).toBe('r1');
    });

    it('accepts explicit durationMs', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const exec = instrument.recordExecution('orient', [], 0, '{}', 42);

      expect(exec.durationMs).toBe(42);
    });
  });

  // --- startExecution (timed) ---

  describe('startExecution', () => {
    it('measures elapsed time between start and stop', async () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const handle = instrument.startExecution('orient', ['--note', 'timing']);

      // Small delay to ensure measurable duration
      await new Promise(r => setTimeout(r, 10));

      const exec = handle.stop(0, '{"schema_version":1,"ok":true,"cmd":"orient"}');
      expect(exec.durationMs).toBeGreaterThanOrEqual(5);
      expect(exec.startTime).toBeLessThan(exec.endTime);
    });

    it('strips --mf-run from timed execution args', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const handle = instrument.startExecution('orient', ['--mf-run', 'r1', '--note', 'x']);
      const exec = handle.stop(0, '{}');

      expect(exec.args).toEqual(['--note', 'x']);
      expect(exec.mfRunId).toBe('r1');
    });

    it('recorded execution appears in getExecutions', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      const handle = instrument.startExecution('chart', []);
      handle.stop(0, 'chart output');

      expect(instrument.getExecutions()).toHaveLength(1);
      expect(instrument.getExecutions()[0].cmd).toBe('chart');
    });
  });

  // --- summarize ---

  describe('summarize', () => {
    it('aggregates execution statistics', () => {
      const instrument = new CommandInstrument('test-run', tmp);
      instrument.recordExecution('orient', [], 0, '{"schema_version":1,"ok":true,"cmd":"orient"}', 10);
      instrument.recordExecution('chart', [], 0, 'chart text', 20);
      instrument.recordExecution('fail', [], 1, 'Error: boom', 5);

      const summary = instrument.summarize();
      expect(summary.runId).toBe('test-run');
      expect(summary.commands).toBe(3);
      expect(summary.totalDurationMs).toBe(35);
      expect(summary.byExitCode[0]).toBe(2);
      expect(summary.byExitCode[1]).toBe(1);
      expect(summary.byStructure['envelope']).toBe(1);
      expect(summary.byStructure['text']).toBe(2);
      expect(summary.executions).toHaveLength(3);
    });

    it('empty instrument produces zero-count summary', () => {
      const instrument = new CommandInstrument('empty-run', tmp);
      const summary = instrument.summarize();

      expect(summary.commands).toBe(0);
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.executions).toHaveLength(0);
    });
  });

  // --- saveMining ---

  describe('saveMining', () => {
    it('writes mining.json to run directory', () => {
      const instrument = new CommandInstrument('save-test', tmp);
      instrument.recordExecution('orient', [], 0, '{}');
      const path = instrument.saveMining();

      expect(existsSync(path)).toBe(true);
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      expect(data.runId).toBe('save-test');
      expect(data.commands).toBe(1);
      expect(data.executions).toHaveLength(1);
    });

    it('creates nested run directory', () => {
      const instrument = new CommandInstrument('nested/run', tmp);
      instrument.recordExecution('test', [], 0, 'ok');
      const path = instrument.saveMining();

      expect(existsSync(path)).toBe(true);
    });

    it('mining.json has valid summary structure', () => {
      const instrument = new CommandInstrument('struct-test', tmp);
      instrument.recordExecution('a', [], 0, '{}', 10);
      instrument.recordExecution('b', [], 1, 'fail', 20);
      instrument.saveMining();

      const path = join(tmp, '.roadmap', 'runs', 'struct-test', 'mining.json');
      const data = JSON.parse(readFileSync(path, 'utf-8'));

      expect(data).toHaveProperty('runId');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('commands');
      expect(data).toHaveProperty('totalDurationMs');
      expect(data).toHaveProperty('byStructure');
      expect(data).toHaveProperty('byExitCode');
      expect(data).toHaveProperty('executions');
      expect(data.totalDurationMs).toBe(30);
    });
  });

  // --- getExecutions ---

  describe('getExecutions', () => {
    it('returns readonly view of executions', () => {
      const instrument = new CommandInstrument('ro-test', tmp);
      instrument.recordExecution('a', [], 0, '{}');
      instrument.recordExecution('b', [], 0, '{}');

      const execs = instrument.getExecutions();
      expect(execs).toHaveLength(2);
      expect(execs[0].cmd).toBe('a');
      expect(execs[1].cmd).toBe('b');
    });
  });
});
