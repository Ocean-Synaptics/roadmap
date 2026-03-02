import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeCompletion,
  getAgentCompletions,
  type CompletionRecord,
} from '../src/lib/roadmap/completion-sharding.ts';
import {
  mergeShardsFromDisk,
  validateMergeSemantics,
  verifyDeterminism,
} from '../src/lib/roadmap/completion-merge.ts';

describe('completion-sharding-integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'completion-sharding-load-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('50-agent load test', () => {
    it('should handle 50 concurrent agents writing 2 completions each without contention', async () => {
      const NUM_AGENTS = 50;
      const NODES_PER_AGENT = 2;
      const TOTAL_NODES = NUM_AGENTS * NODES_PER_AGENT;

      const startTime = performance.now();
      const agentLatencies: number[] = [];

      // Spawn 50 agents concurrently, each writing 2 completions
      const agentPromises = Array.from({ length: NUM_AGENTS }, async (_, agentIdx) => {
        const agentId = `agent-${agentIdx}`;
        const agentStart = performance.now();

        // Each agent writes 2 completions to simulate a 2-node batch
        const writePromises = Array.from({ length: NODES_PER_AGENT }, async (_, nodeIdx) => {
          const nodeId = `node-batch-${Math.floor(agentIdx / 5)}-${nodeIdx}`;
          const artifacts = [`/path/agent-${agentIdx}/artifact-${nodeIdx}.ts`];

          await writeCompletion(
            tmpDir,
            agentId,
            nodeId,
            'completed',
            artifacts,
            `cp-${agentIdx}-${nodeIdx}`,
          );
        });

        await Promise.all(writePromises);
        const agentEnd = performance.now();
        agentLatencies.push(agentEnd - agentStart);
      });

      await Promise.all(agentPromises);
      const totalTime = performance.now() - startTime;

      // Validate all completions written
      const allCompletions: CompletionRecord[] = [];
      for (let i = 0; i < NUM_AGENTS; i++) {
        const agentId = `agent-${i}`;
        const records = await getAgentCompletions(tmpDir, agentId);
        allCompletions.push(...records);
        expect(records).toHaveLength(NODES_PER_AGENT);
      }

      expect(allCompletions).toHaveLength(TOTAL_NODES);

      // Merge shards for validation
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const mergeStart = performance.now();
      const merged = await mergeShardsFromDisk(completionsDir);
      const mergeTime = performance.now() - mergeStart;

      // Validate merge semantics
      const validation = await validateMergeSemantics(completionsDir, merged);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(merged.completions).toHaveLength(TOTAL_NODES);
      expect(merged.agentCount).toBe(NUM_AGENTS);

      // Metrics
      const avgCompletionLatency = agentLatencies.reduce((a, b) => a + b, 0) / agentLatencies.length;
      const maxCompletionLatency = Math.max(...agentLatencies);
      const minCompletionLatency = Math.min(...agentLatencies);

      console.log(`\n50-Agent Load Test Results:`);
      console.log(`Total concurrent write time: ${totalTime.toFixed(2)}ms`);
      console.log(`Avg agent completion latency: ${avgCompletionLatency.toFixed(2)}ms`);
      console.log(`Min agent completion latency: ${minCompletionLatency.toFixed(2)}ms`);
      console.log(`Max agent completion latency: ${maxCompletionLatency.toFixed(2)}ms`);
      console.log(`Merge consolidation time: ${mergeTime.toFixed(2)}ms`);
      console.log(`Throughput: ${(TOTAL_NODES / totalTime).toFixed(2)} completions/ms`);

      // Verify latencies are reasonable
      expect(avgCompletionLatency).toBeLessThan(50); // Should be fast (1-5ms per agent, 2 writes = 2-10ms)
      expect(maxCompletionLatency).toBeLessThan(100);
    });

    it('should maintain merge semantics across shard isolation', async () => {
      const NUM_AGENTS = 50;

      // Write completions from all agents to their shards concurrently
      const promises = Array.from({ length: NUM_AGENTS }, async (_, agentIdx) => {
        const agentId = `agent-semantic-${agentIdx}`;

        // Write 2 completions per agent
        await writeCompletion(
          tmpDir,
          agentId,
          'shared-node-1',
          'completed',
          [`node-1-agent-${agentIdx}.ts`],
          `cp-1-${agentIdx}`,
        );

        await writeCompletion(
          tmpDir,
          agentId,
          'shared-node-2',
          'completed',
          [`node-2-agent-${agentIdx}.ts`],
          `cp-2-${agentIdx}`,
        );
      });

      await Promise.all(promises);

      // Merge and validate
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const merged = await mergeShardsFromDisk(completionsDir);

      // All agents should be represented
      expect(merged.agentCount).toBe(NUM_AGENTS);
      expect(merged.agentIds).toHaveLength(NUM_AGENTS);

      // All completions should be present
      expect(merged.completions).toHaveLength(NUM_AGENTS * 2);

      // Group by node
      const node1Records = merged.completions.filter(r => r.nodeId === 'shared-node-1');
      const node2Records = merged.completions.filter(r => r.nodeId === 'shared-node-2');

      expect(node1Records).toHaveLength(NUM_AGENTS);
      expect(node2Records).toHaveLength(NUM_AGENTS);

      // Validate all agents present in each node
      const node1Agents = new Set(node1Records.map(r => r.agentId));
      const node2Agents = new Set(node2Records.map(r => r.agentId));

      for (let i = 0; i < NUM_AGENTS; i++) {
        const agentId = `agent-semantic-${i}`;
        expect(node1Agents.has(agentId)).toBe(true);
        expect(node2Agents.has(agentId)).toBe(true);
      }
    });

    it('should provide deterministic merge regardless of agent write order', async () => {
      const NUM_AGENTS = 20;

      // Randomly order agent writes to test determinism
      const agentIndices = Array.from({ length: NUM_AGENTS }, (_, i) => i);
      for (let i = agentIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [agentIndices[i], agentIndices[j]] = [agentIndices[j], agentIndices[i]];
      }

      // Write in randomized order
      const promises = agentIndices.map(async (agentIdx) => {
        const agentId = `agent-deterministic-${agentIdx}`;

        await writeCompletion(
          tmpDir,
          agentId,
          'determinism-node',
          'completed',
          [`artifact-${agentIdx}.ts`],
          `cp-deterministic-${agentIdx}`,
        );
      });

      await Promise.all(promises);

      // Verify determinism across multiple merges
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const determinism = await verifyDeterminism(completionsDir, 5);

      expect(determinism.deterministic).toBe(true);
      expect(determinism.reason).toBeUndefined();
    });

    it('should validate no data loss in 50-agent merge', async () => {
      const NUM_AGENTS = 50;

      // Create completion records with unique identifiers
      const expectedRecords = new Map<string, CompletionRecord[]>();

      const promises = Array.from({ length: NUM_AGENTS }, async (_, agentIdx) => {
        const agentId = `agent-loss-test-${agentIdx}`;
        const records: CompletionRecord[] = [];

        // Each agent writes 2 unique completions
        for (let nodeIdx = 0; nodeIdx < 2; nodeIdx++) {
          const nodeId = `loss-node-${agentIdx}-${nodeIdx}`;
          const artifact = `artifact-${agentIdx}-${nodeIdx}.ts`;

          await writeCompletion(tmpDir, agentId, nodeId, 'completed', [artifact], `cp-${agentIdx}-${nodeIdx}`);

          records.push({
            timestamp: new Date().toISOString(),
            agentId,
            nodeId,
            status: 'completed',
            artifacts: [artifact],
            checkpointId: `cp-${agentIdx}-${nodeIdx}`,
          });
        }

        expectedRecords.set(agentId, records);
      });

      await Promise.all(promises);

      // Read back and validate
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      const merged = await mergeShardsFromDisk(completionsDir);

      // Verify record counts
      expect(merged.completions).toHaveLength(NUM_AGENTS * 2);

      // Verify all unique nodeIds present
      const mergedNodeIds = new Set(merged.completions.map(r => r.nodeId));
      const expectedNodeIds = new Set<string>();

      for (let agentIdx = 0; agentIdx < NUM_AGENTS; agentIdx++) {
        for (let nodeIdx = 0; nodeIdx < 2; nodeIdx++) {
          expectedNodeIds.add(`loss-node-${agentIdx}-${nodeIdx}`);
        }
      }

      expect(mergedNodeIds.size).toBe(expectedNodeIds.size);
      for (const nodeId of expectedNodeIds) {
        expect(mergedNodeIds.has(nodeId)).toBe(true);
      }

      // Validation should pass
      const validation = await validateMergeSemantics(completionsDir, merged);
      expect(validation.valid).toBe(true);
    });

    it('should complete batch advancement validation with merged state', async () => {
      const NUM_AGENTS = 50;
      const BATCH_1_NODES = 2;
      const BATCH_2_NODES = 1;

      // Simulate batch 1: all agents write 2 completions
      const batch1Promises = Array.from({ length: NUM_AGENTS }, async (_, agentIdx) => {
        const agentId = `agent-batch-${agentIdx}`;

        for (let nodeIdx = 0; nodeIdx < BATCH_1_NODES; nodeIdx++) {
          await writeCompletion(
            tmpDir,
            agentId,
            `batch-1-node-${nodeIdx}`,
            'completed',
            [`batch1-${agentIdx}-${nodeIdx}.ts`],
            `cp-b1-${agentIdx}-${nodeIdx}`,
          );
        }
      });

      await Promise.all(batch1Promises);

      // Validate batch 1 completion
      const completionsDir = join(tmpDir, '.roadmap', 'completions');
      let merged = await mergeShardsFromDisk(completionsDir);

      const batch1Completions = merged.completions.filter(r =>
        r.nodeId.startsWith('batch-1-node'),
      );
      expect(batch1Completions).toHaveLength(NUM_AGENTS * BATCH_1_NODES);

      // Simulate batch 2: all agents write 1 completion
      const batch2Promises = Array.from({ length: NUM_AGENTS }, async (_, agentIdx) => {
        const agentId = `agent-batch-${agentIdx}`;

        for (let nodeIdx = 0; nodeIdx < BATCH_2_NODES; nodeIdx++) {
          await writeCompletion(
            tmpDir,
            agentId,
            `batch-2-node-${nodeIdx}`,
            'completed',
            [`batch2-${agentIdx}-${nodeIdx}.ts`],
            `cp-b2-${agentIdx}-${nodeIdx}`,
          );
        }
      });

      await Promise.all(batch2Promises);

      // Validate batch 2 completion
      merged = await mergeShardsFromDisk(completionsDir);

      const batch2Completions = merged.completions.filter(r =>
        r.nodeId.startsWith('batch-2-node'),
      );
      expect(batch2Completions).toHaveLength(NUM_AGENTS * BATCH_2_NODES);

      // Validate total
      expect(merged.completions).toHaveLength(NUM_AGENTS * (BATCH_1_NODES + BATCH_2_NODES));

      const validation = await validateMergeSemantics(completionsDir, merged);
      expect(validation.valid).toBe(true);
    });
  });
});
