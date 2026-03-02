import { describe, it, expect } from 'vitest';
import { BriefGate, validateBrief, isSealedBrief } from '../src/lib/agent-dispatch/brief-gate.ts';
import { writeInterimHandoff, writeFinalHandoff, loadHandoffChain, loadFinal } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { Brief, InterimHandoff, FinalHandoff } from '../src/lib/brief.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('agent-dispatch', () => {
  describe('validateBrief', () => {
    const validBrief: Brief = {
      position: 'test',
      produces: ['src/test.ts'],
      consumes: [],
      description: 'Test node',
      pattern: 'implement and validate',
      mode: 'execute',
      handoffJournal: [],
      remaining: 5,
    };

    it('should reject brief with invalid artifact paths', () => {
      const brief: Brief = {
        ...validBrief,
        produces: ['invalid-node-id'],
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE')).toBe(true);
    });

    it('should accept valid brief', () => {
      const result = validateBrief(validBrief);
      expect(result.passed).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect DAG leakage', () => {
      const brief = { ...validBrief, deps: ['some-dep'] } as any;
      const result = validateBrief(brief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_DEPS')).toBe(true);
    });

    it('should validate artifact paths in consumes', () => {
      const brief: Brief = {
        ...validBrief,
        consumes: ['src/lib/brief.ts', '.roadmap/head.json'],
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(true);
    });

    it('should type-guard sealed briefs', () => {
      expect(isSealedBrief(validBrief)).toBe(true);
      expect(isSealedBrief({ position: 'test' })).toBe(false);
      expect(isSealedBrief(null)).toBe(false);
    });
  });

  describe('handoff-journal', () => {
    let tmpRoot: string;

    it('should write and load interim handoffs in sequence', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const entry: InterimHandoff = {
        timestamp: new Date().toISOString(),
        progress: 0.5,
        discovered: ['found thing'],
        blockers: [],
        currentFile: 'a.ts',
      };

      const seq0 = await writeInterimHandoff(tmpRoot, 'node-a', entry);
      expect(seq0).toBe(0);

      const seq1 = await writeInterimHandoff(tmpRoot, 'node-a', { ...entry, progress: 0.8 });
      expect(seq1).toBe(1);

      const chain = await loadHandoffChain(tmpRoot, 'node-a');
      expect(chain).toHaveLength(2);
      expect(chain[0].progress).toBe(0.5);
      expect(chain[1].progress).toBe(0.8);

      await rm(tmpRoot, { recursive: true });
    });

    it('should write and load final handoff', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const final: FinalHandoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['done'],
        blockers: [],
        currentFile: '',
        summary: 'built it',
        keyDecisions: ['chose X'],
        gotchas: [],
        nextNodeEntry: { consumes: ['a.ts'], ready: true },
      };

      await writeFinalHandoff(tmpRoot, 'node-b', final);
      const loaded = await loadFinal(tmpRoot, 'node-b');
      expect(loaded).toBeDefined();
      expect(loaded!.summary).toBe('built it');

      const chain = await loadHandoffChain(tmpRoot, 'node-b');
      expect(chain).toHaveLength(1);
      expect((chain[0] as FinalHandoff).summary).toBe('built it');

      await rm(tmpRoot, { recursive: true });
    });

    it('should return empty chain for nonexistent node', async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'hj-'));
      const chain = await loadHandoffChain(tmpRoot, 'nope');
      expect(chain).toHaveLength(0);
      await rm(tmpRoot, { recursive: true });
    });
  });

  describe('orchestrator', () => {
    it('should export runOrchestrator', async () => {
      const mod = await import('../src/lib/agent-dispatch/orchestrator.ts');
      expect(typeof mod.runOrchestrator).toBe('function');
    });
  });
});
