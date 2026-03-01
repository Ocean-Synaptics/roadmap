import { describe, it, expect } from 'vitest';
import { CommandInstrument } from '../../src/lib/metaflow/command-instrumentation.ts';

describe('Metaflow command instrumentation', () => {
  it('captures command execution metrics', () => {
    const instrument = new CommandInstrument('test-run', process.cwd());
    const exec = instrument.recordExecution('orient', ['--note', 'test'], 0, '{"ok": true}');

    expect(exec.cmd).toBe('orient');
    expect(exec.exitCode).toBe(0);
    expect(exec.outputStructure).toBe('json');
  });

  it('classifies mixed output as mixed', () => {
    const instrument = new CommandInstrument('test-run', process.cwd());
    const exec = instrument.recordExecution('test', [], 1, '{"error": true}\nWarning text');

    expect(exec.outputStructure).toBe('mixed');
  });
});
