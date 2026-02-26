import { test, expect } from 'vitest';
import { AuditTrail } from '../src/lib/audit.ts';

test('audit: record entry', () => {
  const trail = new AuditTrail('.');
  trail.startSession('test-agent');
  trail.record({
    nodeId: 'build',
    status: 'complete',
    duration: 1000,
    artifacts: [{ path: 'dist/index.js', hash: 'sha256:abc123' }],
  });

  expect(trail.getArtifacts()).toHaveLength(1);
  expect(trail.getArtifacts()[0].path).toBe('dist/index.js');
});

test('audit: multiple entries', () => {
  const trail = new AuditTrail('.');
  trail.startSession('agent-1');
  trail.record({ nodeId: 'a', status: 'complete', duration: 100 });
  trail.record({ nodeId: 'b', status: 'complete', duration: 200 });
  trail.record({ nodeId: 'c', status: 'failed', duration: 50, error: 'timeout' });

  expect(trail.getFailedPhases()).toEqual(['c']);
  expect(trail.getTotalDuration()).toBe(350);
});

test('audit: markdown formatting', () => {
  const trail = new AuditTrail('.');
  trail.startSession('test-agent');
  trail.record({ nodeId: 'phase-1', status: 'complete', duration: 500 });
  trail.record({ nodeId: 'phase-2', status: 'complete', duration: 300 });

  const md = (trail as any).formatMarkdown();
  expect(md).toContain('test-agent');
  expect(md).toContain('phase-1');
  expect(md).toContain('phase-2');
  expect(md).toContain('2 phases, 2 passed');
});

test('audit: restoration tracking', () => {
  const trail = new AuditTrail('.');
  trail.startSession('recovered-agent', 'cp-20260225-101530');

  expect((trail as any).session.restoredFrom).toBe('cp-20260225-101530');
  expect((trail as any).formatMarkdown()).toContain('Restored from: cp-20260225-101530');
});
