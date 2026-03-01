import { describe, it, expect } from 'vitest';
import {
  detectCorruption,
  type DetectorInput,
  type CorruptionType,
} from '../../src/lib/completion/corruption-detector.ts';
import type { ClaimStore } from '../../src/lib/claims/claims.ts';

function makeInput(overrides: Partial<DetectorInput> = {}): DetectorInput {
  return {
    dagNodeIds: new Set(['init', 'build', 'test', 'term']),
    claims: {},
    completedNodeIds: new Set(),
    artifactExists: () => true,
    nodeProduces: {},
    now: new Date('2026-03-01T12:00:00Z'),
    ...overrides,
  };
}

function claim(owner: string, minutesAgo: number, ttlMinutes: number): ClaimStore[string] {
  const now = new Date('2026-03-01T12:00:00Z');
  const claimedAt = new Date(now.getTime() - minutesAgo * 60_000);
  const claimExpiry = new Date(claimedAt.getTime() + ttlMinutes * 60_000);
  return {
    owner,
    claimedAt: claimedAt.toISOString(),
    claimExpiry: claimExpiry.toISOString(),
  };
}

function issueTypes(report: ReturnType<typeof detectCorruption>): CorruptionType[] {
  return report.issues.map(i => i.type);
}

describe('corruption-detector', () => {
  it('returns clean report when no corruption', () => {
    const report = detectCorruption(makeInput());
    expect(report.clean).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.scanned.nodes).toBe(4);
  });

  describe('orphaned claims', () => {
    it('detects claim for node not in DAG', () => {
      const report = detectCorruption(makeInput({
        claims: { 'nonexistent-node': claim('agent-1', 2, 10) },
      }));
      expect(report.clean).toBe(false);
      expect(issueTypes(report)).toContain('orphaned-claim');
      expect(report.issues[0].nodeId).toBe('nonexistent-node');
      expect(report.issues[0].severity).toBe('error');
    });

    it('does not flag claim for valid DAG node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 2, 10) },
      }));
      expect(issueTypes(report)).not.toContain('orphaned-claim');
    });
  });

  describe('stale locks', () => {
    it('detects expired claim on incomplete node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 20, 5) }, // claimed 20m ago, expired 15m ago
      }));
      expect(issueTypes(report)).toContain('stale-lock');
      expect(report.issues.find(i => i.type === 'stale-lock')!.severity).toBe('warning');
    });

    it('does not flag expired claim on completed node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 20, 5) },
        completedNodeIds: new Set(['build']),
      }));
      expect(issueTypes(report)).not.toContain('stale-lock');
    });

    it('does not flag active claim on incomplete node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 2, 10) }, // still active
      }));
      expect(issueTypes(report)).not.toContain('stale-lock');
    });
  });

  describe('claimed-completed', () => {
    it('detects active claim on already-completed node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 2, 10) }, // active
        completedNodeIds: new Set(['build']),
      }));
      expect(issueTypes(report)).toContain('claimed-completed');
    });

    it('does not flag expired claim on completed node', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('agent-1', 20, 5) }, // expired
        completedNodeIds: new Set(['build']),
      }));
      expect(issueTypes(report)).not.toContain('claimed-completed');
    });
  });

  describe('phantom completions', () => {
    it('detects completion record for node not in DAG', () => {
      const report = detectCorruption(makeInput({
        completedNodeIds: new Set(['ghost-node']),
      }));
      expect(issueTypes(report)).toContain('phantom-completion');
      expect(report.issues.find(i => i.type === 'phantom-completion')!.severity).toBe('error');
    });

    it('does not flag completion for valid DAG node', () => {
      const report = detectCorruption(makeInput({
        completedNodeIds: new Set(['build']),
      }));
      expect(issueTypes(report)).not.toContain('phantom-completion');
    });
  });

  describe('missing artifacts', () => {
    it('detects completed node with missing produced artifact', () => {
      const report = detectCorruption(makeInput({
        completedNodeIds: new Set(['build']),
        nodeProduces: { build: ['dist/main.js', 'dist/types.d.ts'] },
        artifactExists: (p) => p !== 'dist/types.d.ts',
      }));
      expect(issueTypes(report)).toContain('missing-artifact');
      const issue = report.issues.find(i => i.type === 'missing-artifact')!;
      expect(issue.detail?.path).toBe('dist/types.d.ts');
    });

    it('does not flag when all artifacts exist', () => {
      const report = detectCorruption(makeInput({
        completedNodeIds: new Set(['build']),
        nodeProduces: { build: ['dist/main.js'] },
        artifactExists: () => true,
      }));
      expect(issueTypes(report)).not.toContain('missing-artifact');
    });

    it('skips nodes with no produces', () => {
      const report = detectCorruption(makeInput({
        completedNodeIds: new Set(['init']),
        nodeProduces: {},
        artifactExists: () => false,
      }));
      expect(issueTypes(report)).not.toContain('missing-artifact');
    });
  });

  describe('multiple corruption types', () => {
    it('reports all corruption types in a single scan', () => {
      const report = detectCorruption(makeInput({
        claims: {
          'ghost': claim('agent-1', 2, 10),     // orphaned (not in DAG)
          build: claim('agent-2', 20, 5),        // stale lock (expired, not completed)
          test: claim('agent-3', 2, 10),         // claimed-completed (active + completed)
        },
        completedNodeIds: new Set(['test', 'phantom']),
        nodeProduces: { test: ['out.txt'] },
        artifactExists: () => false,
      }));

      const types = issueTypes(report);
      expect(types).toContain('orphaned-claim');
      expect(types).toContain('stale-lock');
      expect(types).toContain('claimed-completed');
      expect(types).toContain('phantom-completion');
      expect(types).toContain('missing-artifact');
      expect(report.clean).toBe(false);
    });
  });

  describe('report metadata', () => {
    it('scanned counts reflect input sizes', () => {
      const report = detectCorruption(makeInput({
        claims: { build: claim('a', 1, 10), test: claim('b', 1, 10) },
        completedNodeIds: new Set(['init']),
      }));
      expect(report.scanned).toEqual({ nodes: 4, claims: 2, completions: 1 });
    });
  });
});
