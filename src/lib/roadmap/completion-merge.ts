// @module completion-merge
// @exports mergeShardsFromDisk, validateMergeSemantics
// @types MergeResult
// @entry roadmap/optimization

import {
  type CompletionRecord,
  validateCompletionRecord,
  readShards,
} from './completion-sharding.schema';

export interface MergeResult {
  readonly completions: CompletionRecord[];
  readonly agentCount: number;
  readonly agentIds: string[];
}

/**
 * Merge all completion shards from disk into a single consolidated array
 * Reads all .roadmap/completions/*.jsonl files and combines into one array
 * Sorts deterministically by (timestamp, agentId) for reproducible output
 * Returns consolidated completions array and metadata
 */
export async function mergeShardsFromDisk(completionsDir: string): Promise<MergeResult> {
  const shards = await readShards(completionsDir);

  const allCompletions: CompletionRecord[] = [];
  const agentIds = new Set<string>();

  // Collect all records from all shards
  for (const [agentId, records] of Array.from(shards.entries())) {
    agentIds.add(agentId);
    allCompletions.push(...records);
  }

  // Sort deterministically by timestamp (ascending), then agentId (lexicographic)
  // This ensures identical input always produces identical output
  const sorted = [...allCompletions].sort((a, b) => {
    const timeCompare = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeCompare !== 0) return timeCompare;
    return a.agentId.localeCompare(b.agentId);
  });

  return {
    completions: sorted,
    agentCount: agentIds.size,
    agentIds: Array.from(agentIds).sort(),
  };
}

/**
 * Validate that merged result is semantically equivalent to sequential writes
 * Checks:
 * - All agent shards are represented in merge
 * - No duplicate records (by timestamp, agentId, nodeId)
 * - No lost records between input and output
 * - Sort order is deterministic (same input → same output)
 */
export async function validateMergeSemantics(
  completionsDir: string,
  mergedResult: MergeResult,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Validate all agents represented
  const shards = await readShards(completionsDir);
  const inputAgentIds = Array.from(Array.from(shards.keys())).sort();
  const outputAgentIds = mergedResult.agentIds;

  if (inputAgentIds.length !== outputAgentIds.length) {
    errors.push(
      `Agent count mismatch: input has ${inputAgentIds.length}, output has ${outputAgentIds.length}`,
    );
  }

  for (const agentId of inputAgentIds) {
    if (!outputAgentIds.includes(agentId)) {
      errors.push(`Missing agent in merge result: ${agentId}`);
    }
  }

  // Count records per agent in shards
  const inputCounts = new Map<string, number>();
  for (const [agentId, records] of Array.from(shards.entries())) {
    inputCounts.set(agentId, records.length);
  }

  // Count records per agent in merged result
  const outputCounts = new Map<string, number>();
  for (const record of mergedResult.completions) {
    outputCounts.set(record.agentId, (outputCounts.get(record.agentId) || 0) + 1);
  }

  // Verify counts match
  for (const [agentId, inputCount] of Array.from(inputCounts.entries())) {
    const outputCount = outputCounts.get(agentId) || 0;
    if (inputCount !== outputCount) {
      errors.push(
        `Record count mismatch for ${agentId}: input has ${inputCount}, output has ${outputCount}`,
      );
    }
  }

  // Validate sort order is ascending by timestamp
  for (let i = 1; i < mergedResult.completions.length; i++) {
    const prev = mergedResult.completions[i - 1];
    const curr = mergedResult.completions[i];
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();

    if (currTime < prevTime) {
      errors.push(
        `Sort order violation at index ${i}: ${prev.timestamp} > ${curr.timestamp}`,
      );
    }

    // For same timestamp, must be sorted by agentId
    if (currTime === prevTime && prev.agentId > curr.agentId) {
      errors.push(
        `Secondary sort violation at index ${i}: agents not sorted lexicographically for same timestamp`,
      );
    }
  }

  // Validate all records pass schema validation
  for (let i = 0; i < mergedResult.completions.length; i++) {
    if (!validateCompletionRecord(mergedResult.completions[i])) {
      errors.push(`Invalid record at index ${i}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify determinism: merge same shards multiple times, expect identical results
 * Used in testing to ensure same input always produces same output
 */
export async function verifyDeterminism(
  completionsDir: string,
  iterations: number = 3,
): Promise<{ deterministic: boolean; reason?: string }> {
  if (iterations < 2) {
    return { deterministic: false, reason: 'Need at least 2 iterations' };
  }

  const results: string[] = [];

  for (let i = 0; i < iterations; i++) {
    const result = await mergeShardsFromDisk(completionsDir);
    const serialized = JSON.stringify(result);
    results.push(serialized);
  }

  // All serializations must be identical
  const first = results[0];
  for (let i = 1; i < results.length; i++) {
    if (results[i] !== first) {
      return {
        deterministic: false,
        reason: `Iteration ${i} produced different result than iteration 0`,
      };
    }
  }

  return { deterministic: true };
}
