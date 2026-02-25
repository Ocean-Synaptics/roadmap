import { test, expect } from 'vitest';
import { define, graph } from '../src/protocol.ts';
import { checkCompatibility, migrateDAG } from '../src/versioning.schema.ts';

test('versioning: 0.1.0 not compatible with 0.3.0', () => {
  const compat = checkCompatibility('0.1.0', '0.3.0');
  expect(compat.compatible).toBe(true);
  expect(compat.needsMigration).toBe(true);
  expect(compat.migrations).toEqual(['0.2.0', '0.3.0']);
});

test('versioning: 0.3.0 compatible with 0.3.0', () => {
  const compat = checkCompatibility('0.3.0', '0.3.0');
  expect(compat.compatible).toBe(true);
  expect(compat.needsMigration).toBeUndefined();
});

test('versioning: cannot load 0.4.0 with 0.3.0', () => {
  const compat = checkCompatibility('0.4.0', '0.3.0');
  expect(compat.compatible).toBe(false);
});

test('migration: 0.2.0 → 0.3.0 fills idempotent', () => {
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
        produces: ['a.txt'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: undefined as any,
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['a.txt'],
        deps: ['a'],
        validate: [{ type: 'manual-approval', target: 'approval' }],
        idempotent: undefined as any,
      },
    },
  }));

  const migrated = migrateDAG(dag, '0.3.0');

  // Node A should be idempotent: true (no manual-approval)
  expect((migrated.nodes.a as any).idempotent).toBe(true);

  // Node B should be idempotent: false (has manual-approval)
  expect((migrated.nodes.b as any).idempotent).toBe(false);

  // DAG should be valid
  const verified = define(migrated);
  expect(verified).toBeDefined();
});

test('migration: preserves existing idempotent values', () => {
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
        desc: 'Idempotent',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true, // already set
      },
      b: {
        id: 'b',
        desc: 'Unknown',
        produces: [],
        consumes: [],
        deps: ['a'],
        validate: [],
        idempotent: undefined as any, // will be inferred
      },
    },
  }));

  const migrated = migrateDAG(dag, '0.3.0');

  // A stays true
  expect((migrated.nodes.a as any).idempotent).toBe(true);

  // B gets inferred (no manual-approval, so true)
  expect((migrated.nodes.b as any).idempotent).toBe(true);
});
