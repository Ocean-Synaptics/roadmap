/**
 * Migration tests: verify version handling.
 */

import { describe, it, expect } from 'vitest';
import { detectVersion, applyMigrations } from '../src/migrations';

describe('migrations', () => {
  it('detects v1 graphs', () => {
    const g = { id: 'test', init: 'a', term: 'b', nodes: {} };
    expect(detectVersion(g)).toBe('1');
  });

  it('detects explicit version', () => {
    const g = { version: '2', id: 'test', init: 'a', term: 'b', nodes: {} };
    expect(detectVersion(g)).toBe('2');
  });

  it('v1 graph unchanged if no migration needed', () => {
    const g = { version: '1', id: 'test', init: 'a', term: 'b', nodes: {} };
    const migrated = applyMigrations(g);
    expect(migrated.version).toBe('1');
  });

  it('v1 to v2 migration adds fields', () => {
    const g = {
      version: '1',
      id: 'test',
      init: 'a',
      term: 'b',
      nodes: { a: { id: 'a', produces: [], consumes: [], deps: [], validate: [], idempotent: true } },
    };

    const migrated = applyMigrations(g);
    expect(migrated.version).toBe('2');
    expect(migrated.protocolVersion).toBeDefined();
  });

  it('migration preserves data', () => {
    const g = {
      version: '1',
      id: 'original-id',
      init: 'start',
      term: 'end',
      nodes: {},
    };

    const migrated = applyMigrations(g);
    expect(migrated.id).toBe('original-id');
    expect(migrated.init).toBe('start');
    expect(migrated.term).toBe('end');
  });
});
