// Unit tests for agent-executor.ts — filesystem IO, uses tmp dirs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AgentExecutor,
  executeSealed,
  type ExecutionContext,
  type ExecutionResult,
} from '../src/lib/agent-dispatch/agent-executor.ts';
import type { Brief } from '../src/lib/brief.ts';

// --- Factories ---

function validBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    dagIntent: 'test dag',
    position: 'test-node',
    mode: 'execute',
    produces: ['out/result.txt'],
    consumes: ['in/source.txt'],
    description: 'Test node for unit tests',
    pattern: 'Build artifacts',
    handoffJournal: [],
    remaining: 0,
    ...overrides,
  };
}

function validContext(tmpRoot: string, overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    brief: validBrief(),
    repoRoot: tmpRoot,
    agentId: 'test-agent-001',
    ...overrides,
  };
}

// --- Test suite ---

describe('AgentExecutor', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'agent-executor-test-'));
    // Create .roadmap/.handoff for handoff writes
    mkdirSync(join(tmpRoot, '.roadmap', '.handoff'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // === getBrief ===

  describe('getBrief', () => {
    it('returns the sealed brief from context', () => {
      const brief = validBrief({ position: 'custom-node' });
      const executor = new AgentExecutor({ brief, repoRoot: tmpRoot, agentId: 'a1' });

      const result = executor.getBrief();
      expect(result.position).toBe('custom-node');
      expect(result.produces).toEqual(['out/result.txt']);
      expect(result.consumes).toEqual(['in/source.txt']);
    });
  });

  // === readConsumed access control ===

  describe('readConsumed', () => {
    it('reads an allowed artifact from consumes list', () => {
      const consumePath = 'in/source.txt';
      mkdirSync(join(tmpRoot, 'in'), { recursive: true });
      writeFileSync(join(tmpRoot, consumePath), 'source content');

      const executor = new AgentExecutor(validContext(tmpRoot));
      const content = executor.readConsumed(consumePath);
      expect(content).toBe('source content');
    });

    it('throws on disallowed artifact not in consumes list', () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      expect(() => executor.readConsumed('secrets/key.pem')).toThrow('Access denied');
      expect(() => executor.readConsumed('secrets/key.pem')).toThrow('not in consumes');
    });

    it('throws when file is in consumes but does not exist on disk', () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      expect(() => executor.readConsumed('in/source.txt')).toThrow('Cannot read');
    });

    it('lists allowed files in the error message', () => {
      const brief = validBrief({ consumes: ['a.txt', 'b.txt'] });
      const executor = new AgentExecutor({ brief, repoRoot: tmpRoot, agentId: 'a1' });

      expect(() => executor.readConsumed('c.txt')).toThrow('a.txt, b.txt');
    });
  });

  // === writeProduced access control + directory creation ===

  describe('writeProduced', () => {
    it('writes to a path in produces list and creates parent dirs', () => {
      const executor = new AgentExecutor(validContext(tmpRoot));
      executor.writeProduced('out/result.txt', 'hello world');

      const fullPath = join(tmpRoot, 'out/result.txt');
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf-8')).toBe('hello world');
    });

    it('creates deeply nested directories for produces', () => {
      const brief = validBrief({ produces: ['deep/nested/dir/file.ts'] });
      const executor = new AgentExecutor({ brief, repoRoot: tmpRoot, agentId: 'a1' });

      executor.writeProduced('deep/nested/dir/file.ts', 'content');

      const fullPath = join(tmpRoot, 'deep/nested/dir/file.ts');
      expect(existsSync(fullPath)).toBe(true);
      expect(readFileSync(fullPath, 'utf-8')).toBe('content');
    });

    it('throws on disallowed artifact not in produces list', () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      expect(() => executor.writeProduced('rogue/file.txt', 'data')).toThrow('Access denied');
      expect(() => executor.writeProduced('rogue/file.txt', 'data')).toThrow('not in produces');
    });

    it('lists allowed produce paths in the error message', () => {
      const brief = validBrief({ produces: ['x.ts', 'y.ts'] });
      const executor = new AgentExecutor({ brief, repoRoot: tmpRoot, agentId: 'a1' });

      expect(() => executor.writeProduced('z.ts', 'data')).toThrow('x.ts, y.ts');
    });
  });

  // === execute success path ===

  describe('execute', () => {
    it('succeeds when all produces are written by work function', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('out/result.txt', 'done');
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('test-node');
      expect(result.agentId).toBe('test-agent-001');
      expect(result.producedCount).toBe(1);
      expect(result.error).toBeUndefined();
      expect(result.handoff.progress).toBe(1.0);
      expect(result.handoff.nextNodeEntry.ready).toBe(true);
    });

    it('populates timing fields correctly', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('out/result.txt', 'done');
      });

      expect(result.startTime).toBeTruthy();
      expect(result.endTime).toBeTruthy();
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(0);
      // endTime should be after or equal to startTime
      expect(new Date(result.endTime).getTime()).toBeGreaterThanOrEqual(
        new Date(result.startTime).getTime()
      );
    });

    it('fails when produces are not written (missing artifacts)', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      const result = await executor.execute(async () => {
        // Intentionally do nothing — produces never created
      });

      expect(result.success).toBe(false);
      expect(result.producedCount).toBe(0);
      expect(result.handoff.progress).toBe(0);
      expect(result.handoff.nextNodeEntry.ready).toBe(false);
      expect(result.handoff.nextNodeEntry.blockers).toContain('Missing produced files');
    });

    it('reports partial success when some produces exist', async () => {
      const brief = validBrief({
        produces: ['out/a.txt', 'out/b.txt'],
      });
      const executor = new AgentExecutor({ brief, repoRoot: tmpRoot, agentId: 'a1' });

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('out/a.txt', 'content a');
        // out/b.txt intentionally not written
      });

      expect(result.success).toBe(false);
      expect(result.producedCount).toBe(1);
      expect(result.handoff.progress).toBe(0.5);
      expect(result.handoff.nextNodeEntry.ready).toBe(false);
    });

    it('catches work function errors and returns failure result', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      const result = await executor.execute(async () => {
        throw new Error('catastrophic failure');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('catastrophic failure');
      expect(result.producedCount).toBe(0);
      expect(result.handoff.blockers).toContain('catastrophic failure');
      expect(result.handoff.gotchas).toContain('catastrophic failure');
    });

    it('writes final handoff file to .roadmap/.handoff/<nodeId>.json', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      await executor.execute(async (exec) => {
        exec.writeProduced('out/result.txt', 'done');
      });

      const handoffPath = join(tmpRoot, '.roadmap', '.handoff', 'test-node.json');
      expect(existsSync(handoffPath)).toBe(true);

      const handoff = JSON.parse(readFileSync(handoffPath, 'utf-8'));
      expect(handoff.summary).toBeTruthy();
      expect(handoff.nextNodeEntry).toBeTruthy();
    });
  });

  // === checkpoint ===

  describe('checkpoint', () => {
    it('writes interim handoff to disk during execution', async () => {
      const executor = new AgentExecutor(validContext(tmpRoot));

      await executor.execute(async (exec) => {
        await exec.checkpoint({
          progress: 0.3,
          discovered: ['found a pattern'],
          blockers: [],
        });
        exec.writeProduced('out/result.txt', 'done');
      });

      // Interim files should exist in handoff dir
      const handoffDir = join(tmpRoot, '.roadmap', '.handoff');
      expect(existsSync(handoffDir)).toBe(true);
    });
  });

  // === executeSealed standalone function ===

  describe('executeSealed', () => {
    it('reads consumes and writes produce stubs', async () => {
      // Setup consumed file
      mkdirSync(join(tmpRoot, 'in'), { recursive: true });
      writeFileSync(join(tmpRoot, 'in/source.txt'), 'source data');

      const result = await executeSealed({
        brief: validBrief(),
        repoRoot: tmpRoot,
        agentId: 'sealed-agent',
      });

      expect(result.success).toBe(true);
      expect(result.producedCount).toBe(1);

      // Verify the stub was written
      const produced = readFileSync(join(tmpRoot, 'out/result.txt'), 'utf-8');
      expect(produced).toContain('test-node');
      expect(produced).toContain('sealed executor');
    });

    it('fails when consumed file does not exist', async () => {
      // Do NOT create the consumed file
      const result = await executeSealed({
        brief: validBrief(),
        repoRoot: tmpRoot,
        agentId: 'sealed-agent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot read');
    });

    it('succeeds with empty consumes and produces lists', async () => {
      const brief = validBrief({ consumes: [], produces: [] });

      const result = await executeSealed({
        brief,
        repoRoot: tmpRoot,
        agentId: 'empty-agent',
      });

      expect(result.success).toBe(true);
      expect(result.producedCount).toBe(0);
    });
  });
});
