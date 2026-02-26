import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * Consumer smoke test: minimal roadmap from a consumer project
 *
 * Scenario: external project installs @roadmap, writes roadmap.ts,
 * runs orient() from real filesystem, verifies protocol integration works.
 */

const root = process.cwd();
const tmpBase = join(root, '.test-consumer');
const consumerRoot = join(tmpBase, 'test-project');
const cliPath = join(root, 'bin/roadmap.ts');

function run(cmd: string, cwd: string): any {
  const out = execSync(`node --experimental-strip-types ${cliPath} ${cmd}`, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

beforeAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
  mkdirSync(join(consumerRoot, '.roadmap'), { recursive: true });

  // Initialize as git repo (required for some predicates)
  execSync('git init', { cwd: consumerRoot, stdio: 'pipe' });

  // Consumer's minimal roadmap DAG
  const dag = {
    id: 'test-consumer',
    desc: 'Consumer project workflow',
    init: 'bootstrap',
    term: 'ready',
    nodes: {
      bootstrap: {
        id: 'bootstrap',
        desc: 'Create initial scaffold',
        produces: ['src/main.ts', 'tsconfig.json'],
        consumes: [],
        deps: [],
        validate: [
          { type: 'artifact-exists', target: 'src/main.ts' },
          { type: 'artifact-exists', target: 'tsconfig.json' },
        ],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Build TypeScript to JavaScript',
        produces: ['dist/index.js'],
        consumes: ['src/main.ts', 'tsconfig.json'],
        deps: ['bootstrap'],
        validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
        idempotent: true,
      },
      test: {
        id: 'test',
        desc: 'Run test suite',
        produces: ['coverage/report.html'],
        consumes: ['src/main.ts'],
        deps: ['bootstrap'],
        validate: [{ type: 'artifact-exists', target: 'coverage/report.html' }],
        idempotent: true,
      },
      ready: {
        id: 'ready',
        desc: 'Project ready for release',
        produces: [],
        consumes: ['dist/index.js', 'coverage/report.html'],
        deps: ['build', 'test'],
        validate: [],
        idempotent: false,
      },
    },
  };

  writeFileSync(join(consumerRoot, '.roadmap/head.json'), JSON.stringify(dag, null, 2));

  // Create initial artifacts to simulate bootstrap complete
  mkdirSync(join(consumerRoot, 'src'), { recursive: true });
  writeFileSync(join(consumerRoot, 'src/main.ts'), 'export const main = () => "hello";');
  writeFileSync(join(consumerRoot, 'tsconfig.json'), '{ "compilerOptions": {} }');

  // Commit initial state
  execSync('git add -A && git commit -m "init"', { cwd: consumerRoot, stdio: 'pipe' });
});

afterAll(() => {
  rmSync(tmpBase, { recursive: true, force: true });
});

describe('Consumer integration', () => {
  it('orient() finds position from real filesystem', () => {
    const result = run('orient --note "consumer test"', consumerRoot);

    expect(result).toBeDefined();
    expect(result.position).toBeDefined();
    // With bootstrap artifacts present, next work is build or test (batch)
    const isBuildTestBatch = (Array.isArray(result.position) &&
      (JSON.stringify(result.position) === JSON.stringify(['build', 'test']) ||
       JSON.stringify(result.position) === JSON.stringify(['build']) ||
       JSON.stringify(result.position) === JSON.stringify(['test'])));
    expect(isBuildTestBatch).toBe(true);
    expect(result.done).toBeGreaterThan(0);
    expect(result.produces).toBeDefined();
    expect(Array.isArray(result.produces)).toBe(true);
    expect(result.consumes).toBeDefined();
    expect(Array.isArray(result.consumes)).toBe(true);
  });

  it('orient() reports correct produces/consumes for current node', () => {
    const result = run('orient --note "check consumes"', consumerRoot);

    const currentBatch = result.position;
    const isBuildOrTest = Array.isArray(currentBatch) &&
      (currentBatch.includes('build') || currentBatch.includes('test'));
    expect(isBuildOrTest).toBe(true);

    // Batch could be ['build'], ['test'], or ['build', 'test']
    if (currentBatch.includes('build') && currentBatch.length === 1) {
      expect(result.produces).toContain('dist/index.js');
      expect(result.consumes).toContain('src/main.ts');
      expect(result.consumes).toContain('tsconfig.json');
    } else if (currentBatch.includes('test') && currentBatch.length === 1) {
      expect(result.produces).toContain('coverage/report.html');
      expect(result.consumes).toContain('src/main.ts');
    } else if (currentBatch.length === 2) {
      // Both build and test in parallel
      expect(result.produces).toContain('dist/index.js');
      expect(result.produces).toContain('coverage/report.html');
      expect(result.consumes).toContain('src/main.ts');
    }
  });

  it('orient() identifies remaining nodes', () => {
    const result = run('orient --note "check remaining"', consumerRoot);

    expect(result.remaining).toBeDefined();
    expect(typeof result.remaining).toBe('number');
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('advancing by creating build artifact moves position forward', () => {
    // Create build output
    mkdirSync(join(consumerRoot, 'dist'), { recursive: true });
    writeFileSync(join(consumerRoot, 'dist/index.js'), 'console.log("hello");');

    const result = run('orient --note "after build"', consumerRoot);

    // After build completes, position should be test (or build,test if both parallel)
    expect(Array.isArray(result.position) && result.position.includes('test')).toBe(true);
    // done is a count; with bootstrap and build complete, done should be >= 2
    expect(result.done).toBeGreaterThanOrEqual(2);
  });

  it('chart displays progress correctly', () => {
    const output = run('chart', consumerRoot);

    expect(typeof output).toBe('string');
    expect(output).toContain('test-consumer');
    expect(output).toContain('position');
  });

  it('orient with all artifacts completes to term', () => {
    // Complete test node
    mkdirSync(join(consumerRoot, 'coverage'), { recursive: true });
    writeFileSync(join(consumerRoot, 'coverage/report.html'), '<html></html>');

    const result = run('orient --note "all complete"', consumerRoot);

    expect(result.position).toEqual(['ready']);
    // Terminal node excludes itself from done count: bootstrap, build, test = 3
    expect(result.done).toBe(3);
    expect(result.remaining).toBe(0);
    expect(result.complete).toBe(true);
  });

  it('consumer DAG structure validated by define()', () => {
    // This test verifies that the DAG we created is valid
    // (would fail if structure was invalid: cycles, missing init/term, etc.)
    const result = run('orient --note "validate structure"', consumerRoot);
    expect(result).toBeDefined();
    expect(result.position).toBeDefined();
  });
});
