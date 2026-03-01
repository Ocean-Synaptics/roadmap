import { describe, it, expect, beforeEach } from 'vitest';
import { registry, registerCommand, type CommandDef } from '../src/cli/registry.ts';

describe('cli registry', () => {
  beforeEach(() => {
    registry.clear();
  });

  it('registers and retrieves a command', () => {
    const def: CommandDef = { name: 'test', description: 'A test command', handler: () => {} };
    registerCommand(def);
    expect(registry.get('test')).toBe(def);
  });

  it('rejects duplicate registration', () => {
    registerCommand({ name: 'dup', description: 'first', handler: () => {} });
    expect(() => registerCommand({ name: 'dup', description: 'second', handler: () => {} }))
      .toThrow('Command "dup" already registered');
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
  });
});
