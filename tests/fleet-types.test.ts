import { describe, it, expect } from 'vitest';
import {
  parseFleetManifest,
  parseLoopReceipt,
  FleetManifestSchema,
  LoopReceiptSchema,
  FleetStatusSchema,
} from '../src/lib/fleet-types.ts';

describe('FleetManifest', () => {
  const valid = {
    compiler: '.',
    repos: [
      { name: 'auth-svc', path: '~/src/auth-svc', request: 'request-gallery/auth-svc.json' },
      { name: 'data-store', path: '~/src/data-store' },
    ],
  };

  it('parses valid manifest', () => {
    const result = parseFleetManifest(valid);
    expect(result.compiler).toBe('.');
    expect(result.repos).toHaveLength(2);
    expect(result.repos[0].name).toBe('auth-svc');
    expect(result.repos[1].request).toBeUndefined();
  });

  it('rejects empty repos', () => {
    expect(() => parseFleetManifest({ compiler: '.', repos: [] })).toThrow();
  });

  it('rejects missing compiler', () => {
    expect(() => parseFleetManifest({ repos: [{ name: 'a', path: '/a' }] })).toThrow();
  });

  it('rejects non-object', () => {
    expect(() => parseFleetManifest('string')).toThrow();
  });
});

describe('LoopReceipt', () => {
  const valid = {
    iteration: 3,
    startedAt: '2026-03-12T10:00:00Z',
    closedAt: '2026-03-12T18:00:00Z',
    compilerCommit: 'abc123',
    generations: [
      { repo: 'auth-svc', dagId: 'seed-3', headCommit: 'def456', status: 'complete' as const },
      { repo: 'data-store', dagId: 'seed-3', headCommit: '789abc', status: 'stalled' as const, stalledAt: 'validate-auth' },
    ],
    mining: {
      extracted: ['event-aggregator → generator'],
      requestFixes: ['auth-svc.json: added authorityModel field'],
      stalled: [{ repo: 'data-store', node: 'validate-auth', reason: 'event aggregator not yet implemented' }],
      observations: ['All three repos independently wrote the same topic-validator pattern'],
    },
    previousSha: null,
  };

  it('parses valid receipt', () => {
    const result = parseLoopReceipt(valid);
    expect(result.iteration).toBe(3);
    expect(result.generations).toHaveLength(2);
    expect(result.mining!.extracted).toHaveLength(1);
  });

  it('parses receipt without mining', () => {
    const { mining, ...noMining } = valid;
    const result = parseLoopReceipt(noMining);
    expect(result.mining).toBeUndefined();
  });

  it('rejects negative iteration', () => {
    expect(() => parseLoopReceipt({ ...valid, iteration: -1 })).toThrow();
  });

  it('rejects missing compilerCommit', () => {
    const { compilerCommit, ...bad } = valid;
    expect(() => parseLoopReceipt(bad)).toThrow();
  });
});

describe('FleetStatus', () => {
  it('parses valid status', () => {
    const result = FleetStatusSchema.parse({
      iteration: 2,
      compiler: { repo: '.', headCommit: 'abc' },
      repos: [
        { name: 'auth-svc', path: '/src/auth-svc', dagId: 'seed', status: 'complete', level: 4, done: 10, remaining: 0 },
        { name: 'data-store', path: '/src/data-store', dagId: 'seed', status: 'stalled', level: 2, stalledAt: 'validate-auth', reason: 'failed' },
      ],
      loopReady: false,
      blockers: ['data-store stalled'],
    });
    expect(result.loopReady).toBe(false);
    expect(result.repos[1].stalledAt).toBe('validate-auth');
  });
});
