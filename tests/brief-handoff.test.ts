import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  define,
  graph,
  check,
  verify,
} from '../src/protocol.ts';
import {
  getBrief,
  loadHandoffJournal,
} from '../src/lib/brief.ts';
import {
  checkpoint,
  advance,
  verifyBootstrapSignature,
} from '../src/lib/handoff.ts';

describe('Agent APIs: brief + handoff', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'roadmap-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('getBrief()', () => {
    it('returns sealed brief with position + produces + consumes', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test roadmap',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Start here',
              produces: ['file1.ts'],
              consumes: [],
              deps: [],
            },
            spec: {
              id: 'spec',
              desc: 'Write specification document',
              produces: ['spec.md'],
              consumes: ['file1.ts'],
              deps: ['init'],
            },
            term: {
              id: 'term',
              desc: 'All done',
              produces: [],
              consumes: ['spec.md'],
              deps: ['spec'],
            },
          },
        }),
      );

      const brief = await getBrief(dag, 'spec', tmpDir);

      expect(brief.position).toBe('spec');
      expect(brief.produces).toContain('spec.md');
      expect(brief.consumes).toContain('file1.ts');
      expect(brief.description).toBeTruthy();
      expect(brief.pattern).toBeTruthy();
      expect(brief.remaining).toBeGreaterThan(0);
    });

    it('constrains description to 150 chars', async () => {
      const longDesc =
        'This is a very long description that definitely exceeds one hundred and fifty characters and should be truncated by the getBrief function to avoid token waste';

      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: longDesc,
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['x'],
              deps: ['init'],
            },
          },
        }),
      );

      const brief = await getBrief(dag, 'init', tmpDir);
      expect(brief.description.length).toBeLessThanOrEqual(150);
    });

    it('includes handoff journal if previous node completed', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Start',
              produces: ['a.ts'],
              consumes: [],
              deps: [],
            },
            spec: {
              id: 'spec',
              desc: 'Spec',
              produces: ['spec.md'],
              consumes: ['a.ts'],
              deps: ['init'],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['spec.md'],
              deps: ['spec'],
            },
          },
        }),
      );

      // Write a previous handoff
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });

      const prevHandoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['Key insight'],
        blockers: [],
        currentFile: 'init.ts',
        summary: 'Init phase complete',
        keyDecisions: ['Decision 1'],
        gotchas: [],
        nextNodeEntry: { consumes: ['a.ts'], ready: true },
      };

      await writeFile(
        join(tmpDir, '.roadmap', '.handoff', 'init.json'),
        JSON.stringify(prevHandoff),
      );

      const brief = await getBrief(dag, 'spec', tmpDir);

      expect(brief.handoff).toBeDefined();
      expect(brief.handoff?.summary).toBe('Init phase complete');
    });
  });

  describe('checkpoint()', () => {
    it('writes interim handoff to .roadmap/.handoff/{nodeId}-interim-{ts}.json', async () => {
      const { readdir } = await import('node:fs/promises');

      const interim = {
        timestamp: '2026-02-25T10:15:00Z',
        progress: 0.3,
        discovered: ['Pattern works'],
        blockers: ['Need null-safety'],
        currentFile: 'schema.ts',
      };

      await checkpoint(tmpDir, 'git-state-spec', interim);

      const files = await readdir(join(tmpDir, '.roadmap', '.handoff'));
      const interimFile = files.find((f) => f.startsWith('git-state-spec-interim-'));
      expect(interimFile).toBeDefined();
    });

    it('creates chronological work journal', async () => {
      const interim1 = {
        timestamp: '2026-02-25T10:15:00Z',
        progress: 0.2,
        discovered: ['Interface design'],
        blockers: [],
        currentFile: 'schema.ts',
      };

      const interim2 = {
        timestamp: '2026-02-25T10:22:00Z',
        progress: 0.6,
        discovered: ['Null-safety pattern'],
        blockers: ['lastCheckpoint edge case'],
        currentFile: 'schema.ts',
      };

      await checkpoint(tmpDir, 'git-state-spec', interim1);
      await checkpoint(tmpDir, 'git-state-spec', interim2);

      const journal = await loadHandoffJournal(tmpDir, 'git-state-spec');

      expect(journal).toHaveLength(2);
      expect(journal[0].progress).toBe(0.2);
      expect(journal[1].progress).toBe(0.6);
    });

    it('validates progress 0.0–1.0', async () => {
      const badInterim = {
        timestamp: new Date().toISOString(),
        progress: 1.5, // Invalid
        discovered: [],
        blockers: [],
        currentFile: 'x.ts',
      };

      await expect(checkpoint(tmpDir, 'spec', badInterim)).rejects.toThrow(
        'Progress must be 0.0–1.0',
      );
    });
  });

  describe('advance()', () => {
    it('validates handoff is complete before advancing', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Init',
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['x'],
              deps: ['init'],
            },
          },
        }),
      );

      const incompleteHandoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary: '', // Missing summary
        keyDecisions: [],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      };

      await expect(
        advance(tmpDir, 'init', dag, incompleteHandoff),
      ).rejects.toThrow();
    });

    it('rejects handoff with summary >100 chars', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Init',
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['x'],
              deps: ['init'],
            },
          },
        }),
      );

      const longSummary = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary:
          'This summary is way too long and definitely exceeds the one hundred character limit we enforce to keep briefs tight',
        keyDecisions: ['x'],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      };

      await expect(advance(tmpDir, 'init', dag, longSummary)).rejects.toThrow(
        'summary too long',
      );
    });

    it('writes final handoff and updates position', async () => {
      const { readFile, writeFile, mkdir } = await import('node:fs/promises');

      // Setup position file
      await mkdir(join(tmpDir, '.roadmap'), { recursive: true });
      await writeFile(join(tmpDir, '.roadmap', '.position'), 'spec', 'utf-8');

      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Init',
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            spec: {
              id: 'spec',
              desc: 'Spec',
              produces: ['spec.md'],
              consumes: ['x'],
              deps: ['init'],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['spec.md'],
              deps: ['spec'],
            },
          },
        }),
      );

      const handoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: 'spec.md',
        summary: 'Spec written',
        keyDecisions: ['Design A'],
        gotchas: [],
        nextNodeEntry: { consumes: ['spec.md'], ready: true },
      };

      await advance(tmpDir, 'spec', dag, handoff);

      // Verify handoff was written
      const handoffContent = await readFile(
        join(tmpDir, '.roadmap', '.handoff', 'spec.json'),
        'utf-8',
      );
      expect(JSON.parse(handoffContent).summary).toBe('Spec written');

      // Verify position was updated
      const newPos = await readFile(
        join(tmpDir, '.roadmap', '.position'),
        'utf-8',
      );
      expect(newPos.trim()).toBe('term');
    });
  });

  describe('verifyBootstrapSignature()', () => {
    it('returns true if DAG matches bootstrap signature', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Init',
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['x'],
              deps: ['init'],
            },
          },
        }),
      );

      // Write bootstrap
      const handoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary: 'Test',
        keyDecisions: ['x'],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      };

      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
      await writeFile(
        join(tmpDir, '.roadmap', '.position'),
        'init',
        'utf-8',
      );

      await advance(tmpDir, 'init', dag, handoff);

      // Verify signature matches
      const verified = await verifyBootstrapSignature(tmpDir, dag);
      expect(verified).toBe(true);
    });

    it('returns false if DAG was modified', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Init',
              produces: ['x'],
              consumes: [],
              deps: [],
            },
            term: {
              id: 'term',
              desc: 'Done',
              produces: [],
              consumes: ['x'],
              deps: ['init'],
            },
          },
        }),
      );

      // Setup bootstrap with position
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
      await writeFile(
        join(tmpDir, '.roadmap', '.position'),
        'init',
        'utf-8',
      );

      const handoff = {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary: 'Test',
        keyDecisions: ['x'],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      };

      await advance(tmpDir, 'init', dag, handoff);

      // Modify DAG
      dag.nodes.init.desc = 'MODIFIED';

      // Verify fails
      const verified = await verifyBootstrapSignature(tmpDir, dag);
      expect(verified).toBe(false);
    });
  });

  describe('Integration: agent workflow', () => {
    it('agent checks brief, checkpoints progress, then advances', async () => {
      const dag = define(
        graph({
          id: 'test',
          desc: 'Integration test',
          init: 'init',
          term: 'term',
          nodes: {
            init: {
              id: 'init',
              desc: 'Start: write files',
              produces: ['a.ts', 'b.ts'],
              consumes: [],
              deps: [],
            },
            spec: {
              id: 'spec',
              desc: 'Spec: document design',
              produces: ['design.md'],
              consumes: ['a.ts'],
              deps: ['init'],
            },
            term: {
              id: 'term',
              desc: 'Complete',
              produces: [],
              consumes: ['design.md'],
              deps: ['spec'],
            },
          },
        }),
      );

      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(tmpDir, '.roadmap', '.handoff'), { recursive: true });
      await writeFile(
        join(tmpDir, '.roadmap', '.position'),
        'spec',
        'utf-8',
      );

      // 1. Agent gets brief
      const brief = await getBrief(dag, 'spec', tmpDir);
      expect(brief.produces).toContain('design.md');
      expect(brief.consumes).toContain('a.ts');

      // 2. Agent checkpoints progress (mid-work)
      await checkpoint(tmpDir, 'spec', {
        timestamp: new Date().toISOString(),
        progress: 0.5,
        discovered: ['Design pattern works'],
        blockers: [],
        currentFile: 'design.md',
      });

      // 3. Agent completes and advances
      await advance(tmpDir, 'spec', dag, {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['Design pattern works', 'Examples help'],
        blockers: [],
        currentFile: 'design.md',
        summary: 'Design doc complete with examples',
        keyDecisions: ['Use table format for clarity'],
        gotchas: ['Needed examples to clarify'],
        nextNodeEntry: {
          consumes: ['design.md'],
          ready: true,
        },
      });

      // 4. Next agent reads brief and sees journal
      const nextBrief = await getBrief(dag, 'term', tmpDir);
      expect(nextBrief.handoffJournal).toHaveLength(2); // interim + final
      expect(nextBrief.handoff?.summary).toBe(
        'Design doc complete with examples',
      );
    });
  });
});
