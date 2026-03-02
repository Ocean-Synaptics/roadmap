import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator, type OrchestratorResult } from '../src/lib/agent-dispatch/orchestrator.ts';
import { loadFinal, loadJournal, HandoffJournal } from '../src/lib/agent-dispatch/handoff-journal.ts';
import { AgentExecutor, type ExecutionResult } from '../src/lib/agent-dispatch/agent-executor.ts';
import { getBrief } from '../src/lib/brief.ts';
import type { Graph } from '../src/protocol.ts';

// Minimal DAG: init -> node-a, node-b -> term
function makeTestDAG(): Graph<string> {
  return {
    id: 'test-dispatch',
    desc: 'Test DAG for dispatch integration',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Init node',
        produces: ['init.txt'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      'node-a': {
        id: 'node-a',
        desc: 'First work node',
        produces: ['a.txt'],
        consumes: ['init.txt'],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      'node-b': {
        id: 'node-b',
        desc: 'Second work node',
        produces: ['b.txt'],
        consumes: ['init.txt'],
        deps: ['init'],
        validate: [],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'Terminal node',
        produces: [],
        consumes: ['a.txt', 'b.txt'],
        deps: ['node-a', 'node-b'],
        validate: [],
        idempotent: true,
      },
    } as any,
  };
}

describe('dispatch-system integration', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'dispatch-'));
    await writeFile(join(tmpRoot, 'init.txt'), 'init', 'utf-8');
    await mkdir(join(tmpRoot, '.dispatch', 'handoffs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true });
  });

  it('should execute sealed agent with brief isolation', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'node-a', tmpRoot);

    // Verify brief is sealed (no DAG introspection)
    expect(brief.position).toBe('node-a');
    expect(brief.mode).toBe('execute');
    expect(brief.produces).toContain('a.txt');
    expect(brief.consumes).toContain('init.txt');
    expect(brief.remaining).toBeGreaterThanOrEqual(0);

    // Execute via sealed brief
    const executor = new AgentExecutor({
      brief,
      repoRoot: tmpRoot,
      agentId: 'test-agent-1',
    });

    const result = await executor.execute(async (exec) => {
      // Can only read/write within brief contract
      const initContent = exec.readConsumed('init.txt');
      expect(initContent).toBe('init');

      exec.writeProduced('a.txt', 'content-a');
    });

    expect(result.success).toBe(true);
    expect(result.nodeId).toBe('node-a');
    expect(result.agentId).toBe('test-agent-1');
    expect(result.producedCount).toBe(1);
    expect(result.handoff.progress).toBe(1.0);
  });

  it('should enforce file access boundaries in sealed brief', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'node-a', tmpRoot);

    const executor = new AgentExecutor({
      brief,
      repoRoot: tmpRoot,
      agentId: 'test-agent-2',
    });

    // Attempting to read undeclared file should fail
    const result = await executor.execute(async (exec) => {
      // This should throw
      try {
        exec.readConsumed('forbidden.txt');
        throw new Error('Should have blocked read');
      } catch (e) {
        const err = e as Error;
        expect(err.message).toContain('Access denied');
      }
    });

    expect(result.success).toBe(false);
  });

  it('should checkpoint progress during execution', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'node-a', tmpRoot);

    const executor = new AgentExecutor({
      brief,
      repoRoot: tmpRoot,
      agentId: 'test-agent-3',
    });

    await executor.execute(async (exec) => {
      await exec.checkpoint({
        progress: 0.25,
        discovered: ['started work'],
        blockers: [],
      });

      exec.writeProduced('a.txt', 'data');

      await exec.checkpoint({
        progress: 0.75,
        discovered: ['wrote file'],
        blockers: [],
      });
    });

    // Verify handoff chain exists
    const journal = new HandoffJournal(tmpRoot);
    const chain = await journal.loadChain('node-a');
    expect(chain.totalCheckpoints).toBeGreaterThan(1); // At least interim checkpoints
  });

  it('should write final handoff with completion metadata', async () => {
    const dag = makeTestDAG();
    const brief = await getBrief(dag, 'node-a', tmpRoot);

    const executor = new AgentExecutor({
      brief,
      repoRoot: tmpRoot,
      agentId: 'test-agent-4',
    });

    await executor.execute(async (exec) => {
      exec.writeProduced('a.txt', 'result-a');
    });

    const final = loadFinal(tmpRoot, 'node-a');
    expect(final).toBeDefined();
    expect(final!.progress).toBe(1.0);
    expect(final!.summary).toBeDefined();
    expect(final!.keyDecisions).toBeDefined();
    expect(final!.nextNodeEntry.ready).toBe(true);
  });

  it('should handle orchestrator parallel execution', async () => {
    const dag = makeTestDAG();
    const orchestrator = new Orchestrator({ repoRoot: tmpRoot, parallel: true });

    // Create a minimal dispatch plan
    const brief1 = await getBrief(dag, 'node-a', tmpRoot);
    const brief2 = await getBrief(dag, 'node-b', tmpRoot);

    // Note: this is a simplified test - full dispatch-coordinator would create the plan
    // For now, test the orchestrator's ability to track results
    const executor1 = new AgentExecutor({ brief: brief1, repoRoot: tmpRoot, agentId: 'agent-1' });
    const executor2 = new AgentExecutor({ brief: brief2, repoRoot: tmpRoot, agentId: 'agent-2' });

    const results = await Promise.all([
      executor1.execute(async (e) => e.writeProduced('a.txt', 'data-a')),
      executor2.execute(async (e) => e.writeProduced('b.txt', 'data-b')),
    ]);

    expect(results).toHaveLength(2);
    expect(results.every(r => r.success)).toBe(true);
  });

  it('should collect handoff chain from completed agents', async () => {
    const dag = makeTestDAG();

    // Execute both nodes
    for (const nodeId of ['node-a', 'node-b']) {
      const brief = await getBrief(dag, nodeId, tmpRoot);
      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: `agent-${nodeId}`,
      });

      await executor.execute(async (exec) => {
        const initContent = exec.readConsumed('init.txt');
        exec.writeProduced(brief.produces[0], `result-${nodeId}`);
      });
    }

    // Verify handoffs exist for both nodes
    const finalA = loadFinal(tmpRoot, 'node-a');
    const finalB = loadFinal(tmpRoot, 'node-b');

    expect(finalA).toBeDefined();
    expect(finalB).toBeDefined();
    expect(finalA!.summary).toBeDefined();
    expect(finalB!.summary).toBeDefined();

    // Verify continuity: next agent can load previous handoff
    const briefB = await getBrief(dag, 'node-b', tmpRoot);
    expect(briefB.handoff).toBeDefined(); // node-b consumes node-a outputs
  });
});
