import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, appendFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mergeShardsFromDisk,
  validateMergeSemantics,
  verifyDeterminism,
  type MergeResult,
} from '../src/lib/roadmap/completion-merge.ts';
import { writeCompletion, type CompletionRecord } from '../src/lib/roadmap/completion-sharding.ts';

describe('completion-merge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'completion-merge-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('mergeShardsFromDisk', () => {
    it('should merge completions from multiple agent shards', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', ['a1.ts'], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-b', 'in_progress', ['b2.ts'], 'cp-2');
      await writeCompletion(tmpDir, 'agent-1', 'node-c', 'completed', ['c1.ts'], 'cp-3');

      const result = await mergeShardsFromDisk(join(tmpDir, '.roadmap', 'completions'));

      expect(result.completions).toHaveLength(3);
      expect(result.agentCount).toBe(2);
      expect(result.agentIds).toEqual(['agent-1', 'agent-2']);
    });

    it('should handle missing completions directory', async () => {
      const result = await mergeShardsFromDisk(join(tmpDir, '.roadmap', 'completions'));

      expect(result.completions).toHaveLength(0);
      expect(result.agentCount).toBe(0);
      expect(result.agentIds).toEqual([]);
    });

    it('should sort completions deterministically by timestamp then agentId', async () => {
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      await mkdir(completionsDir, { recursive: true });

      // Create deterministic timestamps (first agent gets older timestamp, second agent gets newer)
      const baseTime = '2026-03-02T10:00:00.000Z';
      const t1 = '2026-03-02T10:00:00.100Z';
      const t2 = '2026-03-02T10:00:00.200Z';

      // Write in non-deterministic order, but with controlled timestamps
      const shard1 = join(completionsDir, 'agent-z.jsonl');
      const shard2 = join(completionsDir, 'agent-a.jsonl');

      const record1 = {
        timestamp: t1,
        agentId: 'agent-z',
        nodeId: 'node-1',
        status: 'completed' as const,
        artifacts: [],
        checkpointId: 'cp-1',
      };
      const record2 = {
        timestamp: t1,
        agentId: 'agent-a',
        nodeId: 'node-2',
        status: 'completed' as const,
        artifacts: [],
        checkpointId: 'cp-2',
      };
      const record3 = {
        timestamp: t2,
        agentId: 'agent-m',
        nodeId: 'node-3',
        status: 'completed' as const,
        artifacts: [],
        checkpointId: 'cp-3',
      };

      await appendFile(shard1, JSON.stringify(record1) + '\n');
      await appendFile(shard2, JSON.stringify(record2) + '\n');
      await appendFile(join(completionsDir, 'agent-m.jsonl'), JSON.stringify(record3) + '\n');

      const result = await mergeShardsFromDisk(completionsDir);

      expect(result.completions).toHaveLength(3);
      // First two should be from t1, sorted by agentId (agent-a before agent-z)
      expect(result.completions[0].timestamp).toBe(t1);
      expect(result.completions[0].agentId).toBe('agent-a');
      expect(result.completions[1].timestamp).toBe(t1);
      expect(result.completions[1].agentId).toBe('agent-z');
      // Third should be from t2
      expect(result.completions[2].timestamp).toBe(t2);
      expect(result.completions[2].agentId).toBe('agent-m');
    });

    it('should sort agentIds lexicographically in result', async () => {
      const agents = ['z-agent', 'a-agent', 'm-agent'];
      for (const agent of agents) {
        await writeCompletion(tmpDir, agent, 'node-1', 'completed', [], 'cp-1');
      }

      const result = await mergeShardsFromDisk(join(tmpDir, '.roadmap', 'completions'));

      expect(result.agentIds).toEqual(['a-agent', 'm-agent', 'z-agent']);
    });
  });

  describe('validateMergeSemantics', () => {
    it('should validate correct merge result', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-b', 'in_progress', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);
      const validation = await validateMergeSemantics(completionsDir, result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect missing agent in merge', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-b', 'in_progress', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      // Simulate missing agent
      const corrupted: MergeResult = {
        completions: result.completions.filter(r => r.agentId !== 'agent-2'),
        agentCount: 1,
        agentIds: ['agent-1'],
      };

      const validation = await validateMergeSemantics(completionsDir, corrupted);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Missing agent'))).toBe(true);
    });

    it('should detect record count mismatch', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-1', 'node-b', 'in_progress', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      // Remove one record
      const corrupted: MergeResult = {
        completions: result.completions.slice(0, 1),
        agentCount: result.agentCount,
        agentIds: result.agentIds,
      };

      const validation = await validateMergeSemantics(completionsDir, corrupted);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Record count mismatch'))).toBe(true);
    });

    it('should detect sort order violations', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-b', 'completed', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      // Reverse the order
      const corrupted: MergeResult = {
        completions: [...result.completions].reverse(),
        agentCount: result.agentCount,
        agentIds: result.agentIds,
      };

      const validation = await validateMergeSemantics(completionsDir, corrupted);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Sort order'))).toBe(true);
    });

    it('should validate all records are schema-compliant', async () => {
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      await mkdir(completionsDir, { recursive: true });

      // Write a valid record
      const shard = join(completionsDir, 'agent-1.jsonl');
      await appendFile(
        shard,
        JSON.stringify({
          timestamp: '2026-03-02T10:00:00Z',
          agentId: 'agent-1',
          nodeId: 'node-1',
          status: 'completed',
          artifacts: [],
          checkpointId: 'cp-1',
        }) + '\n',
      );

      const result = await mergeShardsFromDisk(completionsDir);
      const validation = await validateMergeSemantics(completionsDir, result);

      expect(validation.valid).toBe(true);
    });
  });

  describe('determinism tests', () => {
    it('should produce identical results on repeated merges', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-a', 'completed', ['a.ts'], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-b', 'in_progress', ['b.ts'], 'cp-2');
      await writeCompletion(tmpDir, 'agent-1', 'node-c', 'failed', ['c.ts'], 'cp-3');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');

      const result1 = await mergeShardsFromDisk(completionsDir);
      const result2 = await mergeShardsFromDisk(completionsDir);
      const result3 = await mergeShardsFromDisk(completionsDir);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
      expect(JSON.stringify(result2)).toBe(JSON.stringify(result3));
    });

    it('should verify determinism across iterations', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-x', 'completed', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-y', 'in_progress', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const check = await verifyDeterminism(completionsDir, 5);

      expect(check.deterministic).toBe(true);
    });

    it('should handle empty shards deterministically', async () => {
      const completionsDir = join(tmpDir, '.roadmap', 'completions');

      const result1 = await mergeShardsFromDisk(completionsDir);
      const result2 = await mergeShardsFromDisk(completionsDir);

      expect(result1.completions).toEqual(result2.completions);
      expect(result1.agentCount).toBe(result2.agentCount);
    });
  });

  describe('equivalence to sequential writes', () => {
    it('should preserve all records from sequential writes', async () => {
      // Simulate sequential writes from different agents
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const nodes = ['node-a', 'node-b', 'node-c'];

      for (const agent of agents) {
        for (const node of nodes) {
          await writeCompletion(
            tmpDir,
            agent,
            node,
            'completed',
            [`${agent}/${node}.ts`],
            `cp-${agent}-${node}`,
          );
        }
      }

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      // Should have all 9 records (3 agents × 3 nodes)
      expect(result.completions).toHaveLength(9);
      expect(result.agentCount).toBe(3);

      // All agents should be represented
      const agentsInResult = new Set(result.completions.map(r => r.agentId));
      expect(agentsInResult.size).toBe(3);
    });

    it('should maintain order equivalence across merge', async () => {
      // Write with specific timestamps in order
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      await mkdir(completionsDir, { recursive: true });

      const baseTime = new Date('2026-03-02T10:00:00Z').getTime();
      const records: CompletionRecord[] = [];

      for (let i = 0; i < 5; i++) {
        const record: CompletionRecord = {
          timestamp: new Date(baseTime + i * 100).toISOString(),
          agentId: `agent-${i % 2}`,
          nodeId: `node-${i}`,
          status: 'completed',
          artifacts: [],
          checkpointId: `cp-${i}`,
        };
        records.push(record);
      }

      // Write records to shards
      for (const record of records) {
        const shard = join(completionsDir, `${record.agentId}.jsonl`);
        await appendFile(shard, JSON.stringify(record) + '\n');
      }

      const result = await mergeShardsFromDisk(completionsDir);

      // Verify chronological order is maintained
      for (let i = 1; i < result.completions.length; i++) {
        const prev = new Date(result.completions[i - 1].timestamp).getTime();
        const curr = new Date(result.completions[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  describe('concurrent shard generation', () => {
    it('should handle concurrent writes followed by deterministic merge', async () => {
      // Simulate concurrent writes from 10 agents to 5 nodes each
      const agents = Array.from({ length: 10 }, (_, i) => `agent-${i}`);
      const nodes = Array.from({ length: 5 }, (_, i) => `node-${i}`);

      // Fire off concurrent writes
      const promises = [];
      for (const agent of agents) {
        for (const node of nodes) {
          promises.push(
            writeCompletion(tmpDir, agent, node, 'completed', [`${agent}/${node}.ts`], `cp-${agent}-${node}`),
          );
        }
      }

      await Promise.all(promises);

      const completionsDir = join(tmpDir, '.roadmap', 'completions');

      // Merge should succeed and be deterministic
      const result1 = await mergeShardsFromDisk(completionsDir);
      const result2 = await mergeShardsFromDisk(completionsDir);

      expect(result1.completions).toHaveLength(50);
      expect(result1.agentCount).toBe(10);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));

      // Validate semantics
      const validation = await validateMergeSemantics(completionsDir, result1);
      expect(validation.valid).toBe(true);
    });

    it('should handle concurrent writes without data corruption', async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          writeCompletion(tmpDir, `agent-${i % 5}`, `node-${i}`, 'completed', [], `cp-${i}`),
        );
      }

      await Promise.all(promises);

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      // All records should be present
      expect(result.completions).toHaveLength(20);

      // All agents should be represented
      expect(result.agentCount).toBe(5);
      expect(result.agentIds).toEqual(['agent-0', 'agent-1', 'agent-2', 'agent-3', 'agent-4']);
    });
  });

  describe('edge cases', () => {
    it('should handle single agent with multiple records', async () => {
      for (let i = 0; i < 5; i++) {
        await writeCompletion(tmpDir, 'single-agent', `node-${i}`, 'completed', [], `cp-${i}`);
      }

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      expect(result.completions).toHaveLength(5);
      expect(result.agentCount).toBe(1);
      expect(result.agentIds).toEqual(['single-agent']);
    });

    it('should handle records with empty artifacts', async () => {
      await writeCompletion(tmpDir, 'agent-1', 'node-1', 'pending', [], 'cp-1');
      await writeCompletion(tmpDir, 'agent-2', 'node-2', 'failed', [], 'cp-2');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      expect(result.completions).toHaveLength(2);
      expect(result.completions.every(r => r.artifacts.length === 0)).toBe(true);
    });

    it('should handle records with many artifacts', async () => {
      const artifacts = Array.from({ length: 20 }, (_, i) => `/path/to/artifact-${i}.ts`);
      await writeCompletion(tmpDir, 'agent-1', 'node-complex', 'completed', artifacts, 'cp-1');

      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const result = await mergeShardsFromDisk(completionsDir);

      expect(result.completions).toHaveLength(1);
      expect(result.completions[0].artifacts).toEqual(artifacts);
    });
  });
});
