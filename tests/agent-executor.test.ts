import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { define, graph } from '../src/protocol.ts';
import RoadmapExecutor from '../.claude/agents/roadmap-executor.ts';

describe('RoadmapExecutor agent', () => {
  let tmpDir: string;
  let executor: RoadmapExecutor;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'executor-'));

    // Create minimal roadmap DAG
    const dag = define(
      graph({
        id: 'test-project',
        desc: 'Test project roadmap',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'Initialize: create project files',
            produces: ['project.ts', 'package.json'],
            consumes: [],
            deps: [],
          },
          spec: {
            id: 'spec',
            desc: 'Specification: write API spec',
            produces: ['spec.md'],
            consumes: ['project.ts'],
            deps: ['init'],
          },
          impl: {
            id: 'impl',
            desc: 'Implementation: write implementation',
            produces: ['impl.ts'],
            consumes: ['spec.md'],
            deps: ['spec'],
          },
          term: {
            id: 'term',
            desc: 'Complete',
            produces: [],
            consumes: ['impl.ts'],
            deps: ['impl'],
          },
        },
      }),
    );

    // Write DAG and position
    await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
    await writeFile(
      join(tmpDir, '.roadmap', 'head.json'),
      JSON.stringify(dag, null, 2),
    );
    await writeFile(join(tmpDir, '.roadmap', '.position'), 'init', 'utf-8');

    executor = new RoadmapExecutor(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('getBrief()', () => {
    it('returns sealed brief at init position', async () => {
      const brief = await executor.getBrief();

      expect(brief.position).toBe('init');
      expect(brief.produces).toContain('project.ts');
      expect(brief.produces).toContain('package.json');
      expect(brief.consumes).toHaveLength(0);
      expect(brief.pattern).toBeTruthy();
      expect(brief.description).toBeTruthy();
    });

    it('does not expose full DAG', async () => {
      const brief = await executor.getBrief();

      // Brief should not have direct access to graph structure
      expect(brief).not.toHaveProperty('nodes');
      expect(brief).not.toHaveProperty('deps');
      expect(Object.keys(brief)).toContain('position');
      expect(Object.keys(brief)).toContain('produces');
      expect(Object.keys(brief)).toContain('pattern');
    });

    it('includes handoff if previous node completed', async () => {
      // Simulate previous agent completing init
      await writeFile(
        join(tmpDir, '.roadmap', '.position'),
        'spec',
        'utf-8',
      );

      const prevHandoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['Pattern works'],
        blockers: [],
        currentFile: 'init.ts',
        summary: 'Init complete',
        keyDecisions: ['Use TypeScript'],
        gotchas: [],
        nextNodeEntry: { consumes: ['project.ts'], ready: true },
      };

      await writeFile(
        join(tmpDir, '.roadmap', '.handoff', 'init.json'),
        JSON.stringify(prevHandoff),
      );

      const brief = await executor.getBrief();

      expect(brief.position).toBe('spec');
      expect(brief.handoff).toBeDefined();
      expect(brief.handoff?.summary).toBe('Init complete');
    });
  });

  describe('checkpoint()', () => {
    it('writes interim handoff to work journal', async () => {
      const { readdir } = await import('node:fs/promises');

      await executor.checkpoint({
        progress: 0.3,
        discovered: ['Pattern analysis complete'],
        blockers: [],
        currentFile: 'project.ts',
      });

      const files = await readdir(join(tmpDir, '.roadmap', '.handoff'));
      const interimFile = files.find((f) => f.startsWith('init-interim-'));

      expect(interimFile).toBeDefined();
    });

    it('creates work journal with multiple checkpoints', async () => {
      await executor.checkpoint({
        progress: 0.2,
        discovered: ['Initial analysis'],
        blockers: [],
        currentFile: 'project.ts',
      });

      await executor.checkpoint({
        progress: 0.6,
        discovered: ['Core pattern works', 'Edge case found'],
        blockers: ['Type safety edge case'],
        currentFile: 'project.ts',
      });

      // Advance to next position so we can see the journal from init node
      await executor.advance({
        progress: 1.0,
        discovered: ['All done'],
        blockers: [],
        currentFile: 'project.ts',
        summary: 'Test',
        keyDecisions: ['x'],
        gotchas: [],
        nextNodeEntry: { consumes: ['project.ts'], ready: true },
      });

      // Move to spec and check init's journal
      const executor2 = new RoadmapExecutor(tmpDir);
      const brief = await executor2.getBrief();

      // Journal should now be visible since we're at spec (position after init)
      expect(brief.position).toBe('spec');
      expect(brief.handoffJournal.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('advance()', () => {
    it('moves position to next node', async () => {
      // Create init position files
      await writeFile(join(tmpDir, 'project.ts'), 'export const project = {};');
      await writeFile(join(tmpDir, 'package.json'), '{}');

      await executor.advance({
        progress: 1.0,
        discovered: ['Pattern established'],
        blockers: [],
        currentFile: 'project.ts',
        summary: 'Project files created',
        keyDecisions: ['TypeScript for safety'],
        gotchas: [],
        nextNodeEntry: {
          consumes: ['project.ts', 'package.json'],
          ready: true,
        },
      });

      // Verify position changed
      const newBrief = await executor.getBrief();
      expect(newBrief.position).toBe('spec');
    });

    it('validates handoff before advancing', async () => {
      const incompleteHandoff = {
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary: '', // Empty summary - should fail
        keyDecisions: [],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      };

      await expect(executor.advance(incompleteHandoff)).rejects.toThrow();
    });

    it('preserves work journal through advancement', async () => {
      // Checkpoint during work
      await executor.checkpoint({
        progress: 0.5,
        discovered: ['Pattern A works'],
        blockers: [],
        currentFile: 'project.ts',
      });

      // Complete and advance
      await executor.advance({
        progress: 1.0,
        discovered: ['Pattern A works', 'Patterns complete'],
        blockers: [],
        currentFile: 'project.ts',
        summary: 'Done',
        keyDecisions: ['TypeScript'],
        gotchas: [],
        nextNodeEntry: { consumes: ['project.ts'], ready: true },
      });

      // Move to spec
      await writeFile(join(tmpDir, '.roadmap', '.position'), 'spec', 'utf-8');

      const nextBrief = await executor.getBrief();

      // Journal from previous node should be visible
      expect(nextBrief.handoffJournal).toBeDefined();
      expect(nextBrief.handoffJournal.length).toBeGreaterThan(0);
    });
  });

  describe('getNodeSpec()', () => {
    it('returns node specification with pattern', async () => {
      const spec = await executor.getNodeSpec();

      expect(spec.id).toBe('init');
      expect(spec.description).toContain('Initialize');
      expect(spec.produces).toContain('project.ts');
      expect(spec.pattern).toBeTruthy();
    });
  });

  describe('Integration: full workflow', () => {
    it('agent boots, works, checkpoints, advances, next agent continues', async () => {
      // Agent 1: init node
      let brief = await executor.getBrief();
      expect(brief.position).toBe('init');

      // Work with checkpoints
      await executor.checkpoint({
        progress: 0.5,
        discovered: ['TypeScript setup needed'],
        blockers: [],
        currentFile: 'project.ts',
      });

      // Complete
      await executor.advance({
        progress: 1.0,
        discovered: ['TypeScript works', 'npm initialized'],
        blockers: [],
        currentFile: 'package.json',
        summary: 'Project initialized',
        keyDecisions: ['TypeScript', 'npm workspaces'],
        gotchas: ['Node version compatibility'],
        nextNodeEntry: {
          consumes: ['project.ts', 'package.json'],
          ready: true,
        },
      });

      // Simulate next agent session
      const executor2 = new RoadmapExecutor(tmpDir);

      // Agent 2: spec node
      brief = await executor2.getBrief();
      expect(brief.position).toBe('spec');

      // Agent 2 sees Agent 1's work
      expect(brief.handoff?.summary).toBe('Project initialized');
      expect(brief.handoff?.keyDecisions).toContain('TypeScript');

      // Journal shows Agent 1's checkpoint
      expect(brief.handoffJournal.length).toBeGreaterThan(0);
    });
  });

});
