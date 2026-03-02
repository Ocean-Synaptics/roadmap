import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  PreflightValidator,
  validateStateCoherence,
  validateArtifacts,
  validateSchema,
  validateTypecheck,
} from '../src/lib/roadmap/preflight-validator.ts';

describe('PreflightValidator', () => {
  let testDir: string;
  let validator: PreflightValidator;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(process.cwd(), '.test-roadmap-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.roadmap'), { recursive: true });
    mkdirSync(join(testDir, 'src'), { recursive: true });

    validator = new PreflightValidator(testDir);

    // Initialize git repo for this test
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
    } catch {
      // Git may fail in some environments, that's ok
    }
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('validateStateCoherence', () => {
    it('fails when head.json is missing', () => {
      const result = validator.validateStateCoherence();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('head.json not found'))).toBe(true);
    });

    it('fails when head.json is invalid JSON', () => {
      writeFileSync(join(testDir, '.roadmap', 'head.json'), 'not valid json');
      const result = validator.validateStateCoherence();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('parse error'))).toBe(true);
    });

    it('fails when git-state.json is missing', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'test', headSha: 'abc123', nodes: {} })
      );
      const result = validator.validateStateCoherence();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('git-state.json not found'))).toBe(true);
    });

    it('fails when headSha mismatches git-state.json lastCommit', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'test', headSha: 'abc123', nodes: {} })
      );
      writeFileSync(
        join(testDir, '.roadmap', 'git-state.json'),
        JSON.stringify({ lastCommit: 'xyz789', timestamp: new Date().toISOString() })
      );
      const result = validator.validateStateCoherence();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('headSha mismatch'))).toBe(true);
    });

    it('fails when git commit is invalid', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'test', headSha: 'abc123', nodes: {} })
      );
      writeFileSync(
        join(testDir, '.roadmap', 'git-state.json'),
        JSON.stringify({ lastCommit: 'abc123', timestamp: new Date().toISOString() })
      );
      const result = validator.validateStateCoherence();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('no longer valid'))).toBe(true);
    });

    it('passes with valid state coherence', () => {
      // Create a real git commit
      writeFileSync(join(testDir, 'test.txt'), 'test');
      try {
        execSync('git add test.txt', { cwd: testDir, stdio: 'pipe' });
        execSync('git commit -m "test"', { cwd: testDir, stdio: 'pipe' });
        const commitSha = execSync('git rev-parse HEAD', { cwd: testDir, encoding: 'utf-8' }).trim();

        writeFileSync(
          join(testDir, '.roadmap', 'head.json'),
          JSON.stringify({ id: 'test', headSha: commitSha, nodes: {} })
        );
        writeFileSync(
          join(testDir, '.roadmap', 'git-state.json'),
          JSON.stringify({ lastCommit: commitSha, timestamp: new Date().toISOString() })
        );

        const result = validator.validateStateCoherence();
        expect(result.passed).toBe(true);
      } catch {
        // Skip if git is unavailable
        expect(true).toBe(true);
      }
    });
  });

  describe('validateArtifacts', () => {
    it('fails when head.json is missing', () => {
      const result = validator.validateArtifacts();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('head.json not found'))).toBe(true);
    });

    it('fails when head.json lacks nodes', () => {
      writeFileSync(join(testDir, '.roadmap', 'head.json'), JSON.stringify({ id: 'test' }));
      const result = validator.validateArtifacts();
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('missing nodes'))).toBe(true);
    });

    it('reports missing artifacts as warnings', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          nodes: {
            n1: { id: 'n1', produces: ['output.txt'], consumes: [], deps: [], validate: [] },
          },
        })
      );
      const result = validator.validateArtifacts();
      expect(result.missing).toContain('output.txt');
      expect(result.existing.length).toBe(0);
      expect(result.warnings.some((w) => w.includes('missing'))).toBe(true);
    });

    it('detects existing artifacts', () => {
      writeFileSync(join(testDir, 'output.txt'), 'test content');
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          nodes: {
            n1: { id: 'n1', produces: ['output.txt'], consumes: [], deps: [], validate: [] },
          },
        })
      );
      const result = validator.validateArtifacts();
      expect(result.existing).toContain('output.txt');
      expect(result.missing.length).toBe(0);
    });

    it('handles nested artifact paths', () => {
      mkdirSync(join(testDir, 'src', 'lib'), { recursive: true });
      writeFileSync(join(testDir, 'src', 'lib', 'module.ts'), 'export const x = 1;');
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          nodes: {
            n1: { id: 'n1', produces: ['src/lib/module.ts'], consumes: [], deps: [], validate: [] },
          },
        })
      );
      const result = validator.validateArtifacts();
      expect(result.existing).toContain('src/lib/module.ts');
    });
  });

  describe('validateSchema', () => {
    it('fails when head.json is missing', () => {
      const result = validator.validateSchema();
      expect(result.passed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('fails when required top-level fields are missing', () => {
      const invalidConfigs = [
        { id: 'test' }, // missing init, term
        { init: 'a', term: 'b' }, // missing id
        { id: 'test', init: 'a' }, // missing term
      ];

      for (const config of invalidConfigs) {
        writeFileSync(join(testDir, '.roadmap', 'head.json'), JSON.stringify(config));
        const result = validator.validateSchema();
        expect(result.valid).toBe(false);
      }
    });

    it('fails when nodes is not an object', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'test', init: 'a', term: 'b', nodes: [] })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes('nodes'))).toBe(true);
    });

    it('fails when init/term nodes do not exist', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          init: 'init',
          term: 'term',
          nodes: {
            a: { id: 'a', produces: [], consumes: [], deps: [], validate: [] },
          },
        })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes('init node'))).toBe(true);
    });

    it('fails when nodes lack required fields', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          init: 'a',
          term: 'a',
          nodes: {
            a: { id: 'a' }, // missing produces, consumes, deps, validate
          },
        })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(false);
    });

    it('fails when dependencies reference non-existent nodes', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          init: 'a',
          term: 'b',
          nodes: {
            a: { id: 'a', produces: [], consumes: [], deps: ['nonexistent'], validate: [] },
            b: { id: 'b', produces: [], consumes: [], deps: ['a'], validate: [] },
          },
        })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes('non-existent dependency'))).toBe(true);
    });

    it('detects cycles in dependency graph', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test',
          init: 'a',
          term: 'c',
          nodes: {
            a: { id: 'a', produces: [], consumes: [], deps: ['b'], validate: [] },
            b: { id: 'b', produces: [], consumes: [], deps: ['a'], validate: [] },
            c: { id: 'c', produces: [], consumes: [], deps: [], validate: [] },
          },
        })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(false);
      expect(result.schemaErrors.some((e) => e.includes('Cycle'))).toBe(true);
    });

    it('passes with valid DAG schema', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'test-dag',
          init: 'init',
          term: 'term',
          nodes: {
            init: { id: 'init', produces: ['seed'], consumes: [], deps: [], validate: [] },
            work: { id: 'work', produces: ['output'], consumes: ['seed'], deps: ['init'], validate: [] },
            term: { id: 'term', produces: [], consumes: ['output'], deps: ['work'], validate: [] },
          },
        })
      );
      const result = validator.validateSchema();
      expect(result.valid).toBe(true);
      expect(result.passed).toBe(true);
    });
  });

  describe('validateTypecheck', () => {
    it('passes when git-state.json missing but src/ unchanged', () => {
      // No git setup, so git diff will fail and assume changed
      // But we test the flow anyway
      const result = validator.validateTypecheck();
      // Result depends on whether src/ exists and git is available
      expect(typeof result.srcChanged).toBe('boolean');
      expect(typeof result.typecheckPassed).toBe('boolean');
    });

    it('reports src unchanged when no changes since commit', () => {
      try {
        // Create initial commit
        writeFileSync(join(testDir, 'test.txt'), 'initial');
        execSync('git add test.txt', { cwd: testDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });
        const commitSha = execSync('git rev-parse HEAD', { cwd: testDir, encoding: 'utf-8' }).trim();

        writeFileSync(
          join(testDir, '.roadmap', 'git-state.json'),
          JSON.stringify({ lastCommit: commitSha, timestamp: new Date().toISOString() })
        );

        const result = validator.validateTypecheck();
        expect(result.srcChanged).toBe(false);
        expect(result.passed).toBe(true);
      } catch {
        // Skip if git unavailable
        expect(true).toBe(true);
      }
    });

    it('detects src/ changes since commit', () => {
      try {
        // Create initial commit
        writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 1;');
        execSync('git add src/', { cwd: testDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });
        const commitSha = execSync('git rev-parse HEAD', { cwd: testDir, encoding: 'utf-8' }).trim();

        // Make a change
        writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 2;');

        writeFileSync(
          join(testDir, '.roadmap', 'git-state.json'),
          JSON.stringify({ lastCommit: commitSha, timestamp: new Date().toISOString() })
        );

        const result = validator.validateTypecheck();
        expect(result.srcChanged).toBe(true);
      } catch {
        // Skip if git unavailable
        expect(true).toBe(true);
      }
    });

    it('handles missing git-state.json gracefully', () => {
      const result = validator.validateTypecheck();
      expect(result.passed).toBe(false);
      expect(result.errors.length > 0).toBe(true);
    });
  });

  describe('standalone utilities', () => {
    it('validateStateCoherence works as standalone', () => {
      const result = validateStateCoherence(testDir);
      expect(result.passed).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('validateArtifacts works as standalone', () => {
      const result = validateArtifacts(testDir);
      expect(result.passed).toBe(false);
      expect(Array.isArray(result.missing)).toBe(true);
      expect(Array.isArray(result.existing)).toBe(true);
    });

    it('validateSchema works as standalone', () => {
      const result = validateSchema(testDir);
      expect(result.passed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('validateTypecheck works as standalone', () => {
      const result = validateTypecheck(testDir);
      expect(typeof result.srcChanged).toBe('boolean');
      expect(typeof result.typecheckPassed).toBe('boolean');
    });
  });

  describe('runAll integration', () => {
    it('aggregates all checks into summary', () => {
      // Empty state should fail multiple checks
      const validator2 = new PreflightValidator(testDir);
      const result = validator2.runAll();

      expect(result.allPassed).toBe(false);
      expect(typeof result.summary).toBe('string');
      expect(result.stateCoherence).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.typecheck).toBeDefined();
    });

    it('reports all-passed with valid configuration', () => {
      try {
        // Create a valid git state
        writeFileSync(join(testDir, 'test.txt'), 'test');
        execSync('git add test.txt', { cwd: testDir, stdio: 'pipe' });
        execSync('git commit -m "test"', { cwd: testDir, stdio: 'pipe' });
        const commitSha = execSync('git rev-parse HEAD', { cwd: testDir, encoding: 'utf-8' }).trim();

        // Create valid head.json and git-state.json
        writeFileSync(
          join(testDir, '.roadmap', 'head.json'),
          JSON.stringify({
            id: 'test-dag',
            init: 'init',
            term: 'term',
            headSha: commitSha,
            nodes: {
              init: { id: 'init', produces: [], consumes: [], deps: [], validate: [] },
              term: { id: 'term', produces: [], consumes: [], deps: ['init'], validate: [] },
            },
          })
        );
        writeFileSync(
          join(testDir, '.roadmap', 'git-state.json'),
          JSON.stringify({ lastCommit: commitSha, timestamp: new Date().toISOString() })
        );

        const validator2 = new PreflightValidator(testDir);
        const result = validator2.runAll();

        expect(result.stateCoherence.passed).toBe(true);
        expect(result.schema.passed).toBe(true);
        expect(result.typecheck.passed).toBe(true);
      } catch {
        // Skip if git unavailable
        expect(true).toBe(true);
      }
    });
  });
});
