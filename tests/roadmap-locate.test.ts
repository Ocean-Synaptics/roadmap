import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Test suite for roadmap-locate skill
 * Tests discovery, parsing, orientation, and error handling
 */

const tempBase = join(tmpdir(), `roadmap-locate-test-${Date.now()}`);

function createTestRepo(
  name: string,
  dagContent: Record<string, unknown>,
  createDefaultArtifacts = true,
): string {
  const repoPath = join(tempBase, name);
  mkdirSync(join(repoPath, '.roadmap'), { recursive: true });
  writeFileSync(join(repoPath, '.roadmap', 'head.json'), JSON.stringify(dagContent));

  // Create some default artifacts only if requested
  if (createDefaultArtifacts) {
    mkdirSync(join(repoPath, 'src'), { recursive: true });
    writeFileSync(join(repoPath, 'src', 'index.ts'), 'export const version = "1.0.0";\n');
  }

  return repoPath;
}

function createExcludedDir(
  name: string,
  parentPath: string,
): void {
  mkdirSync(join(parentPath, name), { recursive: true });
}

describe('roadmap-locate', () => {
  beforeAll(() => {
    mkdirSync(tempBase, { recursive: true });
  });

  afterAll(() => {
    try {
      rmSync(tempBase, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('discovers single roadmap in directory', () => {
    const dagSpec = {
      id: 'test-single',
      desc: 'Single test roadmap',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: ['src/index.ts'],
          deps: ['init'],
          validate: [],
          idempotent: false,
        },
      },
    };

    createTestRepo('repo-single', dagSpec);

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    expect(result.roadmaps).toHaveLength(1);
    expect(result.roadmaps[0]).toMatchObject({
      dagId: 'test-single',
      totalNodes: 2,
      complete: true,
    });
    expect(result.timestamp).toBeDefined();
  });

  it('discovers multiple roadmaps in nested structure', () => {
    const dag1 = {
      id: 'test-multi-1',
      desc: 'First test',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: ['src/index.ts'],
          deps: ['init'],
          validate: [],
          idempotent: false,
        },
      },
    };

    const dag2 = {
      id: 'test-multi-2',
      desc: 'Second test',
      init: 'start',
      term: 'complete',
      nodes: {
        start: {
          id: 'start',
          desc: 'Begin',
          produces: ['lib/util.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'lib/util.ts' }],
          idempotent: true,
        },
        complete: {
          id: 'complete',
          desc: 'Finish',
          produces: [],
          consumes: ['lib/util.ts'],
          deps: ['start'],
          validate: [],
          idempotent: false,
        },
      },
    };

    createTestRepo('repo-a', dag1);
    createTestRepo('subdir/repo-b', dag2);

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    expect(result.roadmaps.length).toBeGreaterThanOrEqual(2);
    const ids = result.roadmaps.map((r: { dagId: string }) => r.dagId);
    expect(ids).toContain('test-multi-1');
    expect(ids).toContain('test-multi-2');
  });

  it('returns correct position for incomplete DAG', () => {
    const dagSpec = {
      id: 'test-incomplete',
      desc: 'Incomplete test',
      init: 'phase1',
      term: 'phase3',
      nodes: {
        phase1: {
          id: 'phase1',
          desc: 'Phase 1',
          produces: ['src/a.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/a.ts' }],
          idempotent: true,
        },
        phase2: {
          id: 'phase2',
          desc: 'Phase 2',
          produces: ['src/b.ts'],
          consumes: ['src/a.ts'],
          deps: ['phase1'],
          validate: [{ type: 'artifact-exists', target: 'src/b.ts' }],
          idempotent: true,
        },
        phase3: {
          id: 'phase3',
          desc: 'Phase 3',
          produces: [],
          consumes: ['src/b.ts'],
          deps: ['phase2'],
          validate: [],
          idempotent: false,
        },
      },
    };

    const repoPath = createTestRepo('repo-incomplete', dagSpec, false);

    // Create only the first artifact to make phase1 complete but phase2 incomplete
    mkdirSync(join(repoPath, 'src'), { recursive: true });
    writeFileSync(join(repoPath, 'src', 'a.ts'), 'export const a = 1;');

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const repo = result.roadmaps.find((r: { path: string }) => r.path.includes('repo-incomplete'));
    expect(repo).toBeDefined();
    expect(repo.position).toBe('phase2');
    expect(repo.complete).toBe(false);
  });

  it('excludes node_modules, .git, and standard dirs', () => {
    const dagSpec = {
      id: 'test-exclude',
      desc: 'Test exclusions',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: ['src/index.ts'],
          deps: ['init'],
          validate: [],
          idempotent: false,
        },
      },
    };

    const repoPath = createTestRepo('repo-with-exclusions', dagSpec);

    // Create excluded subdirectories with head.json files
    mkdirSync(join(repoPath, 'node_modules', '.roadmap'), { recursive: true });
    writeFileSync(
      join(repoPath, 'node_modules', '.roadmap', 'head.json'),
      JSON.stringify({ id: 'should-not-find-node-modules', nodes: {} }),
    );

    mkdirSync(join(repoPath, '.git', '.roadmap'), { recursive: true });
    writeFileSync(
      join(repoPath, '.git', '.roadmap', 'head.json'),
      JSON.stringify({ id: 'should-not-find-git', nodes: {} }),
    );

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const ids = result.roadmaps.map((r: { dagId: string }) => r.dagId);
    expect(ids).not.toContain('should-not-find-node-modules');
    expect(ids).not.toContain('should-not-find-git');
  });

  it('returns blockedBy dependencies correctly', () => {
    const dagSpec = {
      id: 'test-blocked',
      desc: 'Test blocking',
      init: 'node1',
      term: 'node4',
      nodes: {
        node1: {
          id: 'node1',
          desc: 'First',
          produces: ['a.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'a.ts' }],
          idempotent: true,
        },
        node2: {
          id: 'node2',
          desc: 'Second',
          produces: ['b.ts'],
          consumes: ['a.ts'],
          deps: ['node1'],
          validate: [{ type: 'artifact-exists', target: 'b.ts' }],
          idempotent: true,
        },
        node3: {
          id: 'node3',
          desc: 'Third',
          produces: ['c.ts'],
          consumes: ['b.ts'],
          deps: ['node2'],
          validate: [{ type: 'artifact-exists', target: 'c.ts' }],
          idempotent: true,
        },
        node4: {
          id: 'node4',
          desc: 'Fourth',
          produces: [],
          consumes: ['c.ts'],
          deps: ['node3'],
          validate: [],
          idempotent: false,
        },
      },
    };

    const repoPath = createTestRepo('repo-blocked', dagSpec, false);

    // Create a.ts and b.ts so node1 and node2 complete, leaving node3 as the position
    writeFileSync(join(repoPath, 'a.ts'), 'export const a = 1;');
    writeFileSync(join(repoPath, 'b.ts'), 'export const b = 2;');

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const repo = result.roadmaps.find((r: { path: string }) => r.path.includes('repo-blocked'));
    expect(repo).toBeDefined();
    expect(repo.position).toBe('node3');
    // blockedBy returns the deps of the current position node (node3 depends on node2)
    expect(repo.blockedBy).toEqual(['node2']);
  });

  it('handles corrupted DAG gracefully', () => {
    const repoPath = join(tempBase, 'repo-corrupted');
    mkdirSync(join(repoPath, '.roadmap'), { recursive: true });
    writeFileSync(join(repoPath, '.roadmap', 'head.json'), 'not valid json {');

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const ids = result.roadmaps.map((r: { dagId: string }) => r.dagId);
    expect(ids).not.toContain('corrupted');
  });

  it('returns timestamp in ISO format', () => {
    createTestRepo('repo-timestamp', {
      id: 'test-ts',
      desc: 'Test',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: false,
        },
      },
    });

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sorts results by path', () => {
    createTestRepo('z-repo', {
      id: 'z-id',
      desc: 'Z',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: false,
        },
      },
    });

    createTestRepo('a-repo', {
      id: 'a-id',
      desc: 'A',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: [],
          deps: [],
          validate: [],
          idempotent: false,
        },
      },
    });

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const paths = result.roadmaps.map((r: { path: string }) => r.path);
    const sortedPaths = [...paths].sort();
    expect(paths).toEqual(sortedPaths);
  });

  it('returns complete=true when position is term node', () => {
    const dagSpec = {
      id: 'test-complete',
      desc: 'Complete test',
      init: 'init',
      term: 'done',
      nodes: {
        init: {
          id: 'init',
          desc: 'Start',
          produces: ['src/index.ts'],
          consumes: [],
          deps: [],
          validate: [{ type: 'artifact-exists', target: 'src/index.ts' }],
          idempotent: true,
        },
        done: {
          id: 'done',
          desc: 'Done',
          produces: [],
          consumes: ['src/index.ts'],
          deps: ['init'],
          validate: [],
          idempotent: false,
        },
      },
    };

    createTestRepo('repo-complete', dagSpec);

    const result = JSON.parse(
      execSync(
        `HOME=${tempBase} npx tsx /home/griffin/.claude/skills/roadmap-locate/backend.ts`,
        { encoding: 'utf-8' }
      )
    );

    const repo = result.roadmaps.find((r: { path: string }) => r.path.includes('repo-complete'));
    expect(repo).toBeDefined();
    expect(repo.position).toBe('done');
    expect(repo.complete).toBe(true);
  });
});
