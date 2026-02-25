import { describe, it, expect } from 'vitest';
import { RoadmapError } from '../src/errors.ts';
import type { ErrorCode } from '../src/errors.ts';

describe('RoadmapError', () => {
  it('creates error with code and context', () => {
    const err = new RoadmapError('POSITION_MISMATCH', {
      attempted: 'node-5',
      current: 'node-3',
      fix: 'advance("node-3", ...) first',
      entry: 'roadmap/agent → advance()',
    });

    expect(err.code).toBe('POSITION_MISMATCH');
    expect(err.context.attempted).toBe('node-5');
    expect(err.context.fix).toContain('advance("node-3"');
    expect(err.name).toBe('RoadmapError');
    expect(err instanceof Error).toBe(true);
  });

  it('auto-formats message from code + context', () => {
    const err = new RoadmapError('NODE_NOT_FOUND', {
      attempted: 'ghost-node',
      fix: 'check graph.nodes for valid IDs',
    });

    expect(err.message).toContain('NODE_NOT_FOUND');
    expect(err.message).toContain('ghost-node');
    expect(err.message).toContain('check graph.nodes');
  });

  it('accepts custom message override', () => {
    const err = new RoadmapError('CYCLE_DETECTED', {}, 'Custom cycle message');
    expect(err.message).toBe('Custom cycle message');
    expect(err.code).toBe('CYCLE_DETECTED');
  });

  it('serializes to JSON with code + context', () => {
    const err = new RoadmapError('CONTRACT_VIOLATION', {
      attempted: 'node-x consumes "config.json"',
      current: 'no predecessor produces it',
      fix: 'add a node that produces "config.json" to deps',
    });

    const json = err.toJSON();
    expect(json.name).toBe('RoadmapError');
    expect(json.code).toBe('CONTRACT_VIOLATION');
    expect(json.context.fix).toContain('config.json');
    expect(json.message).toBeDefined();
  });

  it('is catchable by code', () => {
    try {
      throw new RoadmapError('MERGE_CONFLICT', {
        attempted: 'merge(g1, g2)',
        fix: 'pre-qualify conflicting node IDs',
      });
    } catch (e) {
      if (e instanceof RoadmapError && e.code === 'MERGE_CONFLICT') {
        expect(e.context.fix).toContain('pre-qualify');
        return;
      }
    }
    expect.unreachable('Should have caught RoadmapError');
  });

  it('supports all error codes', () => {
    const codes: ErrorCode[] = [
      'POSITION_MISMATCH', 'CONTRACT_VIOLATION', 'CYCLE_DETECTED',
      'NODE_NOT_FOUND', 'INIT_MISSING', 'TERM_MISSING', 'INIT_TERM_SAME',
      'MERGE_CONFLICT', 'BRANCH_INVALID', 'VALIDATION_FAILED',
      'HANDOFF_MISSING', 'DAG_DISCONNECTED',
    ];

    for (const code of codes) {
      const err = new RoadmapError(code, {});
      expect(err.code).toBe(code);
    }
    expect(codes.length).toBe(12);
  });

  it('allows arbitrary context fields', () => {
    const err = new RoadmapError('VALIDATION_FAILED', {
      nodeId: 'phase-3',
      failedChecks: 2,
      totalChecks: 5,
    });

    expect(err.context.nodeId).toBe('phase-3');
    expect(err.context.failedChecks).toBe(2);
  });
});
