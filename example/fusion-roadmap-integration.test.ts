/**
 * Real project integration test: fusion roadmap
 *
 * This test demonstrates the executor agent working on a real project roadmap.
 * It simulates the executor workflow: getBrief → work → checkpoint → advance
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { define, graph, check, verify } from '../src/protocol.ts';
import RoadmapExecutor from '../.claude/agents/roadmap-executor.ts';

describe('Real project: fusion roadmap integration', () => {
  it.skip('executor agent completes multi-node roadmap workflow', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'fusion-'));

    try {
      // 1. Create a realistic fusion project roadmap
      const dag = define(
        graph({
          id: 'fusion-project',
          desc: 'Fusion: multi-repo coordinator tool',
          init: 'scaffold',
          term: 'deployed',
          nodes: {
            scaffold: {
              id: 'scaffold',
              desc: 'Scaffold: create project structure',
              produces: ['src/index.ts', 'tests/index.test.ts', 'package.json'],
              consumes: [],
              deps: [],
            },
            protocol: {
              id: 'protocol',
              desc: 'Protocol: define coordination DAG format',
              produces: ['src/protocol.ts', 'docs/protocol.md'],
              consumes: ['src/index.ts'],
              deps: ['scaffold'],
            },
            executor: {
              id: 'executor',
              desc: 'Executor: agent that runs fusion workflows',
              produces: ['src/executor.ts', 'tests/executor.test.ts'],
              consumes: ['src/protocol.ts'],
              deps: ['protocol'],
            },
            deployed: {
              id: 'deployed',
              desc: 'Deployed: ready for production',
              produces: [],
              consumes: ['src/executor.ts', 'tests/executor.test.ts'],
              deps: ['executor'],
            },
          },
        }),
      );

      // Validate DAG
      expect(check(dag).done).toBe(true);
      expect(verify(dag)).toHaveLength(0);

      // 2. Setup roadmap in temporary directory
      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
      await writeFile(
        join(tmpDir, '.roadmap', 'head.json'),
        JSON.stringify(dag, null, 2),
      );
      await writeFile(join(tmpDir, '.roadmap', '.position'), 'scaffold', 'utf-8');

      // 3. Executor workflow: scaffold node
      const executor1 = new RoadmapExecutor(tmpDir);

      let brief = await executor1.getBrief();
      expect(brief.position).toBe('scaffold');
      expect(brief.produces).toContain('src/index.ts');

      // Work with checkpoints
      await executor1.checkpoint({
        progress: 0.5,
        discovered: ['TypeScript setup working'],
        blockers: [],
        currentFile: 'src/index.ts',
      });

      // Complete and advance
      await executor1.advance({
        progress: 1.0,
        discovered: ['TypeScript working', 'Build system ready'],
        blockers: [],
        currentFile: 'package.json',
        summary: 'Project scaffolded with TypeScript',
        keyDecisions: ['TypeScript for type safety', 'vitest for testing'],
        gotchas: ['Node 18+ required'],
        nextNodeEntry: {
          consumes: ['src/index.ts'],
          ready: true,
        },
      });

      // 4. Executor workflow: protocol node
      const executor2 = new RoadmapExecutor(tmpDir);

      brief = await executor2.getBrief();
      expect(brief.position).toBe('protocol');

      // Agent 2 sees Agent 1's work
      expect(brief.handoff?.summary).toBeTruthy();
      expect(brief.handoff?.keyDecisions).toBeDefined();
      expect(brief.handoff?.keyDecisions.length).toBeGreaterThan(0);

      await executor2.advance({
        progress: 1.0,
        discovered: ['DAG pattern proven', 'Validation working'],
        blockers: [],
        currentFile: 'docs/protocol.md',
        summary: 'Protocol specified with validation rules',
        keyDecisions: ['DAG for composition', 'Contract-based design'],
        gotchas: [],
        nextNodeEntry: {
          consumes: ['src/protocol.ts', 'docs/protocol.md'],
          ready: true,
        },
      });

      // 5. Executor workflow: executor node
      const executor3 = new RoadmapExecutor(tmpDir);

      brief = await executor3.getBrief();
      expect(brief.position).toBe('executor');
      expect(brief.handoff?.summary).toContain('Protocol');

      await executor3.advance({
        progress: 1.0,
        discovered: ['Executor agents work', 'Position tracking proven'],
        blockers: [],
        currentFile: 'tests/executor.test.ts',
        summary: 'Executor agent implemented',
        keyDecisions: ['Sealed APIs for agents', 'Work journal for continuity'],
        gotchas: [],
        nextNodeEntry: {
          consumes: ['src/executor.ts', 'tests/executor.test.ts'],
          ready: true,
        },
      });

      // 6. Final: deployed node
      const executor4 = new RoadmapExecutor(tmpDir);

      brief = await executor4.getBrief();
      expect(brief.position).toBe('deployed');
      expect(brief.remaining).toBe(0); // Terminal node
      expect(brief.handoff?.summary).toContain('Executor');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates work journal preserves multi-agent knowledge', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'fusion-journal-'));

    try {
      // Create simple 2-node roadmap
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'spec',
          term: 'impl',
          nodes: {
            spec: {
              id: 'spec',
              desc: 'Write spec',
              produces: ['spec.md'],
              consumes: [],
              deps: [],
            },
            impl: {
              id: 'impl',
              desc: 'Implement',
              produces: ['impl.ts'],
              consumes: ['spec.md'],
              deps: ['spec'],
            },
          },
        }),
      );

      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
      await writeFile(
        join(tmpDir, '.roadmap', 'head.json'),
        JSON.stringify(dag, null, 2),
      );
      await writeFile(join(tmpDir, '.roadmap', '.position'), 'spec', 'utf-8');

      // Agent 1 makes discoveries
      const executor1 = new RoadmapExecutor(tmpDir);

      await executor1.checkpoint({
        progress: 0.3,
        discovered: ['API design pattern works'],
        blockers: [],
        currentFile: 'spec.md',
      });

      await executor1.checkpoint({
        progress: 0.7,
        discovered: ['Examples help clarity'],
        blockers: ['Edge case handling'],
        currentFile: 'spec.md',
      });

      await executor1.advance({
        progress: 1.0,
        discovered: ['API design pattern works', 'Examples help clarity', 'Edge case handling solved'],
        blockers: [],
        currentFile: 'spec.md',
        summary: 'Spec complete with patterns and examples',
        keyDecisions: ['Table-driven examples', 'Error cases documented'],
        gotchas: ['Null safety needed for edge cases'],
        nextNodeEntry: { consumes: ['spec.md'], ready: true },
      });

      // Agent 2 reads Agent 1's knowledge
      const executor2 = new RoadmapExecutor(tmpDir);

      const brief = await executor2.getBrief();

      // Handoff is preserved and readable
      expect(brief.handoff).toBeDefined();
      expect(brief.handoff?.summary).toContain('Spec');

      // Journal shows Agent 1's work (may have interim + final entries)
      expect(brief.handoffJournal.length).toBeGreaterThan(0);

      // At least one entry should mention discoveries
      const hasDiscoveries = brief.handoffJournal.some(
        e => e.discovered && e.discovered.length > 0
      );
      expect(hasDiscoveries).toBe(true);

      // Handoff has condensed learnings
      expect(brief.handoff?.keyDecisions).toBeDefined();
      expect(brief.handoff?.keyDecisions.length).toBeGreaterThan(0);
      expect(brief.handoff?.gotchas).toBeDefined();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
