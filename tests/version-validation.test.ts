import { test, expect } from 'vitest';
import { loadDAG } from '../src/versioning.ts';
import { define, graph } from '../src/protocol.ts';

test('versioning: loadDAG auto-migrates 0.2.0 to 0.3.0', async () => {
  const dag = define(graph({
    id: 'test',
    desc: 'Test',
    version: '1.0.0',
    protocolVersion: '0.2.0' as any,
    init: 'a',
    term: 'b',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['x'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: undefined as any,
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['x'],
        deps: ['a'],
        validate: [],
        idempotent: undefined as any,
      },
    },
  }));

  const loaded = await loadDAG(dag, { autoMigrate: true });
  expect((loaded.nodes.a as any).idempotent).toBe(true);
  expect((loaded.nodes.b as any).idempotent).toBe(true);
});

test('versioning: loadDAG rejects incompatible without autoMigrate', async () => {
  const dag = {
    id: 'test',
    desc: 'Test',
    version: '1.0.0',
    protocolVersion: '0.2.0',
    init: 'a',
    term: 'b',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['x'],
        consumes: [],
        deps: [],
        validate: [],
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['x'],
        deps: ['a'],
        validate: [],
      },
    },
  };

  await expect(loadDAG(dag, { autoMigrate: false })).rejects.toThrow('requires migration');
});

test('versioning: loadDAG accepts current version', async () => {
  const dag = define(graph({
    id: 'test',
    desc: 'Test',
    version: '1.0.0',
    protocolVersion: '0.3.0',
    init: 'a',
    term: 'b',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['x'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['x'],
        deps: ['a'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const loaded = await loadDAG(dag, { autoMigrate: false });
  expect(loaded.id).toBe('test');
});
