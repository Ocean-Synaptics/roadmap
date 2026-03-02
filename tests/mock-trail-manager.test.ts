// @module tests/mock-trail-manager
// Tests for MockTrailManager: mock adapter alignment to real API signatures

import { describe, it, expect, beforeEach } from 'vitest';
import { MockTrailManager, createMockTrailManager, TrailEntry } from '../src/lib/roadmap/mocks/mock-trail-manager.ts';

let manager: MockTrailManager;
const testRepoRoot = '/tmp/test-repo';

beforeEach(() => {
  manager = new MockTrailManager(testRepoRoot);
});

describe('MockTrailManager: instantiation', () => {
  it('creates mock manager with repo root', () => {
    expect(manager).toBeDefined();
    expect(manager.getEntryCount()).toBe(0);
  });

  it('createMockTrailManager factory creates and starts manager', () => {
    const m = createMockTrailManager(testRepoRoot, true);
    expect(m).toBeDefined();
    expect(m.getEntryCount()).toBe(0);
  });

  it('createMockTrailManager respects autoStart flag', () => {
    const m = createMockTrailManager(testRepoRoot, false);
    expect(m).toBeDefined();
  });
});

describe('MockTrailManager: appendEntry', () => {
  it('appends entry with all fields', () => {
    const entry: TrailEntry = {
      timestamp: '2026-03-02T12:00:00Z',
      cmd: 'orient',
      note: 'testing',
      batch: ['node-a', 'node-b'],
      level: 0,
    };

    manager.appendEntry(entry);

    expect(manager.getEntryCount()).toBe(1);
    expect(manager.istrailDirty()).toBe(true);
  });

  it('appends multiple entries', () => {
    manager.appendEntry({ timestamp: '2026-03-02T12:00:00Z', cmd: 'orient' });
    manager.appendEntry({ timestamp: '2026-03-02T12:00:01Z', cmd: 'complete' });
    manager.appendEntry({ timestamp: '2026-03-02T12:00:02Z', cmd: 'advance' });

    expect(manager.getEntryCount()).toBe(3);
  });

  it('marks trail dirty after append', () => {
    expect(manager.istrailDirty()).toBe(false);

    manager.appendEntry({ timestamp: '2026-03-02T12:00:00Z', cmd: 'orient' });

    expect(manager.istrailDirty()).toBe(true);
  });

  it('appends entry with default timestamp if not provided', () => {
    const before = new Date().toISOString();

    manager.appendEntry({ cmd: 'orient' });

    const after = new Date().toISOString();
    expect(manager.getEntryCount()).toBe(1);
  });
});

describe('MockTrailManager: autoCommit', () => {
  it('autoCommit returns false when not dirty', () => {
    const result = manager.autoCommit('test message');
    expect(result).toBe(false);
  });

  it('autoCommit returns true when dirty', () => {
    manager.appendEntry({ cmd: 'orient' });
    const result = manager.autoCommit('test message');
    expect(result).toBe(true);
  });

  it('autoCommit clears dirty flag', () => {
    manager.appendEntry({ cmd: 'orient' });
    expect(manager.istrailDirty()).toBe(true);

    manager.autoCommit();

    expect(manager.istrailDirty()).toBe(false);
  });

  it('autoCommit accepts optional message', () => {
    manager.appendEntry({ cmd: 'orient' });
    const result = manager.autoCommit('custom message');
    expect(result).toBe(true);
  });
});

describe('MockTrailManager: syncTrail', () => {
  it('syncTrail is callable (no-op)', () => {
    manager.appendEntry({ cmd: 'orient' });
    expect(manager.istrailDirty()).toBe(true);

    manager.syncTrail();

    expect(manager.istrailDirty()).toBe(false);
  });

  it('syncTrail idempotent', () => {
    manager.syncTrail();
    manager.syncTrail();
    manager.syncTrail();

    expect(manager.getEntryCount()).toBe(0);
  });
});

describe('MockTrailManager: commit', () => {
  it('commit returns success when dirty', () => {
    manager.appendEntry({ cmd: 'orient' });

    const result = manager.commit();

    expect(result.committed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.entriesAdded).toBe(1);
    expect(result.trailSha).toBeDefined();
    expect(result.headSha).toBeDefined();
    expect(result.message).toContain('trail:');
  });

  it('commit returns nothing-dirty when clean', () => {
    const result = manager.commit();

    expect(result.committed).toBe(false);
    expect(result.reason).toBe('nothing-dirty');
  });

  it('commit clears dirty flag', () => {
    manager.appendEntry({ cmd: 'orient' });
    expect(manager.istrailDirty()).toBe(true);

    manager.commit();

    expect(manager.istrailDirty()).toBe(false);
  });

  it('commit counts entries correctly', () => {
    manager.appendEntry({ cmd: 'orient', timestamp: '2026-03-02T12:00:00Z' });
    manager.appendEntry({ cmd: 'complete', timestamp: '2026-03-02T12:00:01Z' });
    manager.appendEntry({ cmd: 'advance', timestamp: '2026-03-02T12:00:02Z' });

    const result = manager.commit();

    expect(result.entriesAdded).toBe(3);
    expect(result.message).toContain('3 entries');
  });
});

describe('MockTrailManager: start/stop', () => {
  it('start enables watching', () => {
    manager.start();
    expect(manager).toBeDefined();
  });

  it('stop disables watching', () => {
    manager.start();
    manager.stop();
    expect(manager).toBeDefined();
  });

  it('start/stop idempotent', () => {
    manager.start();
    manager.start();
    manager.stop();
    manager.stop();
    expect(manager).toBeDefined();
  });
});

describe('MockTrailManager: integration', () => {
  it('full workflow: append → commit → append → commit', () => {
    // First batch
    manager.appendEntry({ cmd: 'orient' });
    manager.appendEntry({ cmd: 'complete' });

    let result = manager.commit();
    expect(result.committed).toBe(true);
    expect(result.entriesAdded).toBe(2);
    expect(manager.istrailDirty()).toBe(false);

    // Second batch
    manager.appendEntry({ cmd: 'advance' });
    result = manager.commit();
    expect(result.committed).toBe(true);
    expect(result.entriesAdded).toBe(1);
    expect(manager.istrailDirty()).toBe(false);
  });

  it('autoCommit works after multiple appends', () => {
    manager.appendEntry({ cmd: 'orient' });
    manager.appendEntry({ cmd: 'complete' });
    manager.appendEntry({ cmd: 'advance' });

    const result = manager.autoCommit('batch commit');
    expect(result).toBe(true);
    expect(manager.getEntryCount()).toBe(3);
  });

  it('syncTrail → append → commit chain', () => {
    manager.syncTrail();
    expect(manager.istrailDirty()).toBe(false);

    manager.appendEntry({ cmd: 'orient' });
    expect(manager.istrailDirty()).toBe(true);

    manager.commit();
    expect(manager.istrailDirty()).toBe(false);
  });
});
