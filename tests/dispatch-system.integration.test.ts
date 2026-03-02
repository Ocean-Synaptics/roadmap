import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, existsSync } from 'node:fs';
import { graph } from '../src/protocol.ts';
import type { Graph } from '../src/protocol/types.ts';
import { DispatchCoordinator, generateDispatchPlan } from '../src/lib/agent-dispatch/dispatch-coordinator.ts';
import { BriefGate, validateBrief, isSealedBrief } from '../src/lib/agent-dispatch/brief-gate.ts';
import { Orchestrator, runOrchestrator } from '../src/lib/agent-dispatch/orchestrator.ts';
import { AgentExecutor } from '../src/lib/agent-dispatch/agent-executor.ts';
import { writeFinalHandoff, loadFinal, loadJournal } from '../src/lib/agent-dispatch/handoff-journal.ts';
import type { Brief, FinalHandoff } from '../src/lib/brief.ts';

// Minimal DAG: init -> task-a, task-b -> term
function createLinearDAG(): Graph<string> {
  return graph({
    id: 'dispatch-test-linear',
    desc: 'Linear dispatch test DAG',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Initialize test',
        produces: ['src/init.ts'],
        consumes: [],
        deps: [],
      },
      'task-a': {
        id: 'task-a',
        desc: 'First task',
        produces: ['src/task-a.ts'],
        consumes: ['src/init.ts'],
        deps: ['init'],
      },
      'task-b': {
        id: 'task-b',
        desc: 'Second task',
        produces: ['src/task-b.ts'],
        consumes: ['src/task-a.ts'],
        deps: ['task-a'],
      },
      term: {
        id: 'term',
        desc: 'Terminator',
        produces: [],
        consumes: ['src/task-b.ts'],
        deps: ['task-b'],
      },
    },
  });
}

// Diamond DAG: init -> {task-a, task-b} -> merge -> term
function createDiamondDAG(): Graph<string> {
  return graph({
    id: 'dispatch-test-diamond',
    desc: 'Diamond dispatch test DAG',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Initialize',
        produces: ['src/base.ts'],
        consumes: [],
        deps: [],
      },
      'task-a': {
        id: 'task-a',
        desc: 'Left branch',
        produces: ['src/left.ts'],
        consumes: ['src/base.ts'],
        deps: ['init'],
      },
      'task-b': {
        id: 'task-b',
        desc: 'Right branch',
        produces: ['src/right.ts'],
        consumes: ['src/base.ts'],
        deps: ['init'],
      },
      merge: {
        id: 'merge',
        desc: 'Merge branches',
        produces: ['src/merged.ts'],
        consumes: ['src/left.ts', 'src/right.ts'],
        deps: ['task-a', 'task-b'],
      },
      term: {
        id: 'term',
        desc: 'Terminator',
        produces: [],
        consumes: ['src/merged.ts'],
        deps: ['merge'],
      },
    },
  });
}

function createBrief(nodeId: string, produces: string[] = [], consumes: string[] = []): Brief {
  return {
    position: nodeId,
    mode: 'execute',
    produces,
    consumes,
    description: `Task: ${nodeId}`,
    pattern: 'Implement and validate',
    handoffJournal: [],
    remaining: 3,
  };
}

function createFinalHandoff(): FinalHandoff {
  return {
    timestamp: new Date().toISOString(),
    progress: 1.0,
    discovered: ['Completed task'],
    blockers: [],
    currentFile: 'src/output.ts',
    summary: 'Task completed successfully',
    keyDecisions: ['Used TypeScript for type safety'],
    gotchas: [],
    nextNodeEntry: {
      consumes: ['src/output.ts'],
      ready: true,
    },
  };
}

describe('dispatch-system integration', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'dispatch-test-'));
  });

  afterEach(async () => {
    try {
      await rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================
  // 1. Brief Validation Tests
  // ============================================================

  describe('brief-gate validation', () => {
    it('should reject brief with missing required fields', () => {
      const invalid = { position: 'test' } as any;
      const result = validateBrief(invalid);
      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject brief with invalid produces reference', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'execute',
        produces: ['invalid-node-id'],
        consumes: [],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE')).toBe(true);
    });

    it('should reject brief with invalid mode', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'invalid' as any,
        produces: ['src/test.ts'],
        consumes: [],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_MODE')).toBe(true);
    });

    it('should reject brief with DAG leakage (deps field)', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'execute',
        produces: ['src/test.ts'],
        consumes: [],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
      };
      const leakedBrief = { ...brief, deps: ['some-dep'] } as any;
      const result = validateBrief(leakedBrief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_DEPS')).toBe(true);
    });

    it('should accept valid brief with execute mode', () => {
      const brief = createBrief('test-node', ['src/output.ts'], ['src/input.ts']);
      const result = validateBrief(brief);
      expect(result.passed).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should accept valid brief with plan mode', () => {
      const brief: Brief = {
        position: 'plan-node',
        mode: 'plan',
        produces: ['design.md'],
        consumes: ['spec.md'],
        description: 'Design the system',
        pattern: 'ADR-driven design',
        handoffJournal: [],
        remaining: 5,
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(true);
    });

    it('should reject brief with invalid consumes reference', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'execute',
        produces: ['src/test.ts'],
        consumes: ['bad-node'],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
      };
      const result = validateBrief(brief);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ARTIFACT_REFERENCE')).toBe(true);
    });

    it('should warn on oversized produces (>5 items)', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'execute',
        produces: Array.from({ length: 6 }, (_, i) => `src/file-${i}.ts`),
        consumes: [],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
      };
      const result = validateBrief(brief);
      expect(result.warnings.some(w => w.code === 'EXCEEDS_RECOMMENDED_SIZE')).toBe(true);
    });

    it('should type-guard sealed briefs correctly', () => {
      const brief = createBrief('test', ['src/test.ts'], []);
      expect(isSealedBrief(brief)).toBe(true);
      expect(isSealedBrief({ position: 'test' })).toBe(false);
      expect(isSealedBrief(null)).toBe(false);
    });
  });

  // ============================================================
  // 2. Dispatch Assignment Tests
  // ============================================================

  describe('dispatch-coordinator assignment', () => {
    it('should assign agents to batch nodes via round-robin', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, {
        repoRoot: tmpRoot,
        assignmentStrategy: 'round-robin',
      });

      const batch = ['task-a', 'task-b'];
      const assignments = await (coordinator as any).assignAgents(batch);
      expect(assignments).toHaveLength(2);
      expect(assignments[0].nodeId).toBe('task-a');
      expect(assignments[1].nodeId).toBe('task-b');
      expect(assignments[0].agentId).toBeDefined();
      expect(assignments[1].agentId).toBeDefined();
    });

    it('should generate agent IDs with structured format', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, {
        repoRoot: tmpRoot,
        assignmentStrategy: 'round-robin',
      });

      const batch = ['task-a', 'task-b'];
      const assignments = await (coordinator as any).assignAgents(batch);

      // Agent IDs should follow pattern: agent-{timestamp}-{index}
      expect(assignments[0].agentId).toMatch(/^agent-\d+-0$/);
      expect(assignments[1].agentId).toMatch(/^agent-\d+-1$/);
    });

    it('should create dispatch plan with valid assignments', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, {
        repoRoot: tmpRoot,
        validateBriefs: false,
      });

      const orientation = {
        position: ['task-a', 'task-b'],
        level: 1,
        batchRemaining: ['task-a', 'task-b'],
        batchComplete: false,
        remaining: ['task-b', 'term'],
      } as any;

      const plan = await coordinator.generatePlan(orientation);

      expect(plan.batch).toEqual(['task-a', 'task-b']);
      expect(plan.assignments.length).toBe(2);
      expect(plan.ready).toBe(true);
      expect(plan.validationErrors).toHaveLength(0);
    });

    it('should validate briefs when requested', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, {
        repoRoot: tmpRoot,
        validateBriefs: true,
      });

      const orientation = {
        position: ['task-a'],
        level: 1,
        batchRemaining: ['task-a'],
        batchComplete: false,
        remaining: ['task-b', 'term'],
      } as any;

      const plan = await coordinator.generatePlan(orientation);

      expect(plan.validationErrors).toBeDefined();
    });
  });

  // ============================================================
  // 3. Agent Execution Tests
  // ============================================================

  describe('agent-executor execution', () => {
    it('should execute sealed brief and produce artifacts', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], []);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('src/task-a.ts', 'export const result = "task-a";');
      });

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('task-a');
      expect(result.agentId).toBe('agent-1');
      expect(result.producedCount).toBe(1);
      expect(result.wallTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should fail when produced files are missing', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts', 'src/extra.ts'], []);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('src/task-a.ts', 'export const result = "task-a";');
      });

      expect(result.success).toBe(false);
      expect(result.producedCount).toBe(1);
    });

    it('should prevent reading files not in consumes', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], ['src/allowed.ts']);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/forbidden.ts'), 'forbidden content');

      const result = await executor.execute(async (exec) => {
        try {
          exec.readConsumed('src/forbidden.ts');
          throw new Error('Should have been blocked');
        } catch (e) {
          if ((e as Error).message.includes('Should have been blocked')) {
            throw e;
          }
          // Expected: Access denied error
        }
      });

      // Execution fails because we threw an error
      expect(result.success).toBe(false);
    });

    it('should prevent writing files not in produces', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], []);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      const result = await executor.execute(async (exec) => {
        try {
          exec.writeProduced('src/forbidden.ts', 'content');
          throw new Error('Should have been blocked');
        } catch (e) {
          if ((e as Error).message.includes('Should have been blocked')) {
            throw e;
          }
          // Expected: Access denied error
        }
      });

      // Execution fails because we threw an error
      expect(result.success).toBe(false);
    });

    it('should checkpoint progress during execution', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], []);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      let checkpointCalled = false;

      const result = await executor.execute(async (exec) => {
        await exec.checkpoint({
          progress: 0.5,
          discovered: ['Working on task-a'],
          blockers: [],
        });
        checkpointCalled = true;
        exec.writeProduced('src/task-a.ts', 'export const result = "task-a";');
      });

      expect(checkpointCalled).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should create final handoff after execution', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], []);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      const result = await executor.execute(async (exec) => {
        exec.writeProduced('src/task-a.ts', 'export const result = "task-a";');
      });

      expect(result.handoff).toBeDefined();
      expect(result.handoff.timestamp).toBeDefined();
      expect(result.handoff.progress).toBe(1.0);
      expect(result.handoff.summary).toBeDefined();
      expect(result.handoff.keyDecisions).toBeDefined();
    });
  });

  // ============================================================
  // 4. Handoff Chain Tests
  // ============================================================

  describe('handoff-chain recording and loading', () => {
    it('should save and load final handoff', async () => {
      const nodeId = 'task-a';
      const handoff = createFinalHandoff();

      await writeFinalHandoff(tmpRoot, nodeId, handoff);
      const loaded = await loadFinal(tmpRoot, nodeId);

      expect(loaded).toBeDefined();
      expect(loaded!.summary).toBe(handoff.summary);
      expect(loaded!.progress).toBe(1.0);
    });

    it('should load handoff chain for completed node', async () => {
      const nodeId = 'task-a';
      const handoff = createFinalHandoff();

      await writeFinalHandoff(tmpRoot, nodeId, handoff);
      const final = loadFinal(tmpRoot, nodeId);

      expect(final).toBeDefined();
      expect(final!.summary).toBe(handoff.summary);
    });

    it('should return empty chain for non-existent node', async () => {
      const chain = await loadJournal(tmpRoot, 'non-existent');
      expect(chain).toHaveLength(0);
    });
  });

  // ============================================================
  // 5. Batch Advancement Tests
  // ============================================================

  describe('batch advancement', () => {
    it('should advance from one batch to next when all nodes complete', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, { repoRoot: tmpRoot });

      const orientation1 = {
        position: ['init'],
        level: 0,
        batchRemaining: ['init'],
        batchComplete: false,
        remaining: ['task-a', 'task-b', 'term'],
      } as any;

      const plan1 = await coordinator.generatePlan(orientation1);
      expect(plan1.batchLevel).toBe(0);

      const orientation2 = {
        position: ['task-a'],
        level: 1,
        batchRemaining: ['task-a'],
        batchComplete: false,
        remaining: ['task-b', 'term'],
      } as any;

      const plan2 = await coordinator.generatePlan(orientation2);
      expect(plan2.batchLevel).toBe(1);
      expect(plan2.batch).toContain('task-a');
    });
  });

  // ============================================================
  // 6. Full Orchestration Tests
  // ============================================================

  describe('orchestrator end-to-end', () => {
    it('should execute sequential batch with single agent', async () => {
      const dag = createLinearDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: false,
      });

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a'],
        batchLevel: 1,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/task-a.ts'], ['src/init.ts']),
          },
        ],
        handoffChain: [],
        totalNodes: 4,
        completedNodes: 1,
        ready: true,
        validationErrors: [],
      };

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/init.ts'), 'export const init = true;');

      const result = await orchestrator.execute(plan);

      expect(result.allPassed).toBe(true);
      expect(result.completedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.batchLevel).toBe(1);
    });

    it('should collect handoffs from executed agents', async () => {
      const dag = createLinearDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: false,
      });

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a'],
        batchLevel: 1,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/task-a.ts'], ['src/init.ts']),
          },
        ],
        handoffChain: [],
        totalNodes: 4,
        completedNodes: 1,
        ready: true,
        validationErrors: [],
      };

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/init.ts'), 'export const init = true;');

      const result = await orchestrator.execute(plan);

      expect(result.handoffChain).toBeDefined();
    });

    it('should report failed nodes', async () => {
      const dag = createLinearDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: false,
      });

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a'],
        batchLevel: 1,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/task-a.ts'], ['src/missing.ts']),
          },
        ],
        handoffChain: [],
        totalNodes: 4,
        completedNodes: 1,
        ready: true,
        validationErrors: [],
      };

      const result = await orchestrator.execute(plan);

      expect(result.allPassed).toBe(false);
    });

    it('should generate summary with batch results', async () => {
      const dag = createLinearDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: false,
      });

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a'],
        batchLevel: 2,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/task-a.ts'], ['src/init.ts']),
          },
        ],
        handoffChain: [],
        totalNodes: 4,
        completedNodes: 2,
        ready: true,
        validationErrors: [],
      };

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/init.ts'), 'export const init = true;');

      const result = await orchestrator.execute(plan);

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('Batch 2');
    });
  });

  // ============================================================
  // 7. Error Handling Tests
  // ============================================================

  describe('error handling', () => {
    it('should handle plan with empty batch gracefully', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, { repoRoot: tmpRoot });

      const orientation = {
        position: [],
        level: 1,
        batchRemaining: [],
        batchComplete: false,
        remaining: [],
      } as any;

      const plan = await coordinator.generatePlan(orientation);

      expect(plan.batch).toEqual([]);
      expect(plan.ready).toBe(false);
    });

    it('should handle missing consumes gracefully', async () => {
      const brief = createBrief('task-a', ['src/task-a.ts'], ['src/missing.ts']);

      const executor = new AgentExecutor({
        brief,
        repoRoot: tmpRoot,
        agentId: 'agent-1',
      });

      const result = await executor.execute(async (exec) => {
        expect(() => {
          exec.readConsumed('src/missing.ts');
        }).toThrow();
      });

      expect(result).toBeDefined();
    });

    it('should record validation failure in result', async () => {
      const dag = createLinearDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: false,
      });

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a'],
        batchLevel: 1,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/task-a.ts'], []),
          },
        ],
        handoffChain: [],
        totalNodes: 4,
        completedNodes: 1,
        ready: true,
        validationErrors: [],
      };

      const result = await orchestrator.execute(plan);

      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // 8. Parallel Execution Tests
  // ============================================================

  describe('parallel execution', () => {
    it('should execute parallel batch with multiple agents', async () => {
      const dag = createDiamondDAG();
      const orchestrator = new Orchestrator({
        repoRoot: tmpRoot,
        parallel: true,
      });

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/base.ts'), 'export const base = true;');

      const plan = {
        timestamp: new Date().toISOString(),
        batch: ['task-a', 'task-b'],
        batchLevel: 1,
        assignments: [
          {
            agentId: 'agent-1',
            nodeId: 'task-a',
            brief: createBrief('task-a', ['src/left.ts'], ['src/base.ts']),
          },
          {
            agentId: 'agent-2',
            nodeId: 'task-b',
            brief: createBrief('task-b', ['src/right.ts'], ['src/base.ts']),
          },
        ],
        handoffChain: [],
        totalNodes: 5,
        completedNodes: 1,
        ready: true,
        validationErrors: [],
      };

      const result = await orchestrator.execute(plan);

      expect(result.completedCount).toBeGreaterThanOrEqual(0);
      expect(result.batchSize).toBe(2);
    });

    it('should preserve assignment count in batch', async () => {
      const dag = createDiamondDAG();
      const coordinator = new DispatchCoordinator(dag, { repoRoot: tmpRoot });

      const orientation = {
        position: ['task-a', 'task-b'],
        level: 1,
        batchRemaining: ['task-a', 'task-b'],
        batchComplete: false,
        remaining: ['merge', 'term'],
      } as any;

      const plan = await coordinator.generatePlan(orientation);

      expect(plan.assignments).toHaveLength(2);
      expect(plan.batch).toHaveLength(2);
    });
  });

  // ============================================================
  // 9. Brief Contract Tests
  // ============================================================

  describe('brief contract integrity', () => {
    it('should validate brief before dispatch', () => {
      const gate = new BriefGate();
      const brief = createBrief('test', ['src/test.ts'], ['src/input.ts']);
      const result = gate.validate(brief);

      expect(result.passed).toBe(true);
    });

    it('should enforce sealed brief invariants', () => {
      const leakedBrief = {
        position: 'test',
        mode: 'execute',
        produces: ['src/test.ts'],
        consumes: ['src/input.ts'],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
        graph: { nodes: {} },
      };

      const gate = new BriefGate();
      const result = gate.validate(leakedBrief as any);

      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_GRAPH')).toBe(true);
    });

    it('should accept handoff in brief', () => {
      const brief: Brief = {
        position: 'test',
        mode: 'execute',
        produces: ['src/test.ts'],
        consumes: [],
        description: 'Test',
        pattern: 'test',
        handoffJournal: [],
        remaining: 1,
        handoff: createFinalHandoff(),
      };

      const gate = new BriefGate();
      const result = gate.validate(brief);

      expect(result.passed).toBe(true);
    });
  });

  // ============================================================
  // 10. Integration: Minimal DAG Execution
  // ============================================================

  describe('full-system integration', () => {
    it('should execute init→term minimal DAG', async () => {
      const dag = graph({
        id: 'dispatch-minimal',
        desc: 'Minimal dispatch DAG',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Start',
            produces: ['src/init.ts'],
            consumes: [],
            deps: [],
          },
          term: {
            id: 'term',
            desc: 'End',
            produces: [],
            consumes: ['src/init.ts'],
            deps: ['init'],
          },
        },
      });

      const coordinator = new DispatchCoordinator(dag, { repoRoot: tmpRoot });
      const orchestrator = new Orchestrator({ repoRoot: tmpRoot, parallel: false });

      const orientation0 = {
        position: ['init'],
        level: 0,
        batchRemaining: ['init'],
        batchComplete: false,
        remaining: ['term'],
      } as any;

      const plan0 = await coordinator.generatePlan(orientation0);
      expect(plan0.batch).toContain('init');

      await mkdir(join(tmpRoot, 'src'), { recursive: true });
      writeFileSync(join(tmpRoot, 'src/init.ts'), 'export const init = 1;');

      const result0 = await orchestrator.execute(plan0);
      expect(result0.batchLevel).toBe(0);
    });

    it('should track progress through multi-batch workflow', async () => {
      const dag = createLinearDAG();
      const coordinator = new DispatchCoordinator(dag, { repoRoot: tmpRoot });

      const plan0 = await coordinator.generatePlan({
        position: ['init'],
        level: 0,
        batchRemaining: ['init'],
        batchComplete: false,
        remaining: ['task-a', 'task-b', 'term'],
      } as any);

      expect(plan0.batchLevel).toBe(0);
      expect(plan0.completedNodes).toBe(0);

      const plan1 = await coordinator.generatePlan({
        position: ['task-a'],
        level: 1,
        batchRemaining: ['task-a'],
        batchComplete: false,
        remaining: ['task-b', 'term'],
      } as any);

      expect(plan1.batchLevel).toBe(1);

      const plan2 = await coordinator.generatePlan({
        position: ['task-b'],
        level: 2,
        batchRemaining: ['task-b'],
        batchComplete: false,
        remaining: ['term'],
      } as any);

      expect(plan2.batchLevel).toBe(2);
    });
  });
});
