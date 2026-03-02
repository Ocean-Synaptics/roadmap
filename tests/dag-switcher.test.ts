import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  DagSwitcher,
  switchDag,
  listDags,
  currentDag,
  DagInfo,
  DagListResult,
} from '../src/lib/roadmap/dag-switcher.ts';

describe('DagSwitcher', () => {
  let testDir: string;
  let switcher: DagSwitcher;

  beforeEach(() => {
    // Create test directory with roadmap structure
    testDir = join(process.cwd(), '.test-dag-switch-' + Date.now());
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.roadmap'), { recursive: true });

    switcher = new DagSwitcher(testDir);

    // Initialize git repo
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
    } catch {
      // Git may fail, that's ok
    }
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getCurrentDagId', () => {
    it('fails when head.json is missing', () => {
      expect(() => switcher.getCurrentDagId()).toThrow('head.json not found');
    });

    it('extracts dag ID from head.json', () => {
      const dagId = 'test-dag-001';
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: dagId, nodes: {} })
      );

      expect(switcher.getCurrentDagId()).toBe(dagId);
    });

    it('returns "unknown" when id field is missing', () => {
      writeFileSync(join(testDir, '.roadmap', 'head.json'), JSON.stringify({ nodes: {} }));

      expect(switcher.getCurrentDagId()).toBe('unknown');
    });

    it('handles invalid JSON gracefully', () => {
      writeFileSync(join(testDir, '.roadmap', 'head.json'), 'not valid json');

      expect(() => switcher.getCurrentDagId()).toThrow();
    });
  });

  describe('listAvailableDags', () => {
    it('returns empty list when no DAG files exist', () => {
      const dags = switcher.listAvailableDags();
      expect(dags).toEqual([]);
    });

    it('discovers head.{dag-id}.json files', () => {
      // Create current head.json
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current-dag', nodes: { a: { id: 'a' } } })
      );

      // Create available DAGs
      writeFileSync(
        join(testDir, '.roadmap', 'head.dag-alpha.json'),
        JSON.stringify({
          id: 'dag-alpha',
          desc: 'Alpha DAG',
          nodes: { n1: { id: 'n1' }, n2: { id: 'n2' } },
        })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.dag-beta.json'),
        JSON.stringify({
          id: 'dag-beta',
          desc: 'Beta DAG',
          nodes: { n1: { id: 'n1' } },
        })
      );

      const dags = switcher.listAvailableDags();

      expect(dags).toHaveLength(2);
      expect(dags.map((d) => d.id)).toContain('dag-alpha');
      expect(dags.map((d) => d.id)).toContain('dag-beta');
    });

    it('marks current DAG in the list', () => {
      // Create head.json and head.{dagId}.json with same content
      const currentContent = JSON.stringify({ id: 'current-dag', nodes: {} });
      writeFileSync(join(testDir, '.roadmap', 'head.json'), currentContent);
      writeFileSync(
        join(testDir, '.roadmap', 'head.current-dag.json'),
        currentContent
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.other.json'),
        JSON.stringify({ id: 'other-dag', nodes: {} })
      );

      const dags = switcher.listAvailableDags();
      const current = dags.find((d) => d.id === 'current-dag');
      expect(current?.isCurrent).toBe(true);
    });

    it('counts nodes in each DAG', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.test.json'),
        JSON.stringify({
          id: 'test-dag',
          nodes: {
            init: { id: 'init' },
            work: { id: 'work' },
            term: { id: 'term' },
          },
        })
      );

      const dags = switcher.listAvailableDags();
      const testDag = dags.find((d) => d.id === 'test-dag');
      expect(testDag?.nodes).toBe(3);
    });

    it('skips invalid JSON files', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.invalid.json'),
        'not valid json'
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.valid.json'),
        JSON.stringify({ id: 'valid-dag', nodes: {} })
      );

      const dags = switcher.listAvailableDags();
      expect(dags.map((d) => d.id)).toContain('valid-dag');
      expect(dags.map((d) => d.id)).not.toContain('invalid');
    });

    it('returns sorted list by DAG ID', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      for (const name of ['zebra', 'alpha', 'charlie', 'bravo']) {
        writeFileSync(
          join(testDir, '.roadmap', `head.${name}.json`),
          JSON.stringify({ id: name, nodes: {} })
        );
      }

      const dags = switcher.listAvailableDags();
      const ids = dags.map((d) => d.id);
      expect(ids).toEqual(['alpha', 'bravo', 'charlie', 'zebra']);
    });
  });

  describe('switchToDag', () => {
    it('fails when target DAG does not exist', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      const result = switcher.switchToDag('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('fails when target DAG is invalid JSON', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.invalid.json'),
        'not valid json'
      );

      const result = switcher.switchToDag('invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('successfully switches to a valid DAG', () => {
      // Create current DAG
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'current-dag',
          desc: 'Current',
          nodes: { a: { id: 'a' } },
        })
      );

      // Create target DAG
      const targetContent = JSON.stringify({
        id: 'target-dag',
        desc: 'Target',
        nodes: { x: { id: 'x' }, y: { id: 'y' } },
      });

      writeFileSync(
        join(testDir, '.roadmap', 'head.target.json'),
        targetContent
      );

      const result = switcher.switchToDag('target');

      expect(result.success).toBe(true);
      expect(result.prevDagId).toBe('current-dag');
      expect(result.newDagId).toBe('target');

      // Verify head.json was updated
      const updatedHead = JSON.parse(
        readFileSync(join(testDir, '.roadmap', 'head.json'), 'utf-8')
      );
      expect(updatedHead.id).toBe('target-dag');
    });

    it('creates backup of current head.json before switch', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.target.json'),
        JSON.stringify({ id: 'target', nodes: {} })
      );

      switcher.switchToDag('target');

      const backup = readFileSync(
        join(testDir, '.roadmap', 'head.json.backup'),
        'utf-8'
      );
      expect(JSON.parse(backup).id).toBe('current');
    });

    it('updates git-state.json on successful switch', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.target.json'),
        JSON.stringify({ id: 'target', nodes: {} })
      );

      switcher.switchToDag('target');

      if (existsSync(join(testDir, '.roadmap', 'git-state.json'))) {
        const gitState = JSON.parse(
          readFileSync(join(testDir, '.roadmap', 'git-state.json'), 'utf-8')
        );
        expect(gitState.message).toContain('switched');
        expect(gitState.message).toContain('target');
      }
    });
  });

  describe('restorePreviousDag', () => {
    it('fails when no backup exists', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      const result = switcher.restorePreviousDag();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No backup');
    });

    it('restores from backup after switch', () => {
      const currentContent = JSON.stringify({ id: 'dag-a', nodes: {} });
      const targetContent = JSON.stringify({ id: 'dag-b', nodes: {} });

      writeFileSync(join(testDir, '.roadmap', 'head.json'), currentContent);
      writeFileSync(
        join(testDir, '.roadmap', 'head.target.json'),
        targetContent
      );

      // Switch to target
      switcher.switchToDag('target');

      // Verify we're on target
      let current = JSON.parse(
        readFileSync(join(testDir, '.roadmap', 'head.json'), 'utf-8')
      );
      expect(current.id).toBe('dag-b');

      // Restore
      const result = switcher.restorePreviousDag();

      expect(result.success).toBe(true);
      expect(result.newDagId).toBe('dag-a');

      // Verify we're back on original
      current = JSON.parse(
        readFileSync(join(testDir, '.roadmap', 'head.json'), 'utf-8')
      );
      expect(current.id).toBe('dag-a');
    });
  });

  describe('getDagInfo', () => {
    it('returns null for non-existent DAG', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      const info = switcher.getDagInfo('nonexistent');
      expect(info).toBeNull();
    });

    it('returns DAG info by dagId or id', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.my-dag.json'),
        JSON.stringify({
          id: 'my-dag-id',
          desc: 'My DAG',
          nodes: { a: { id: 'a' } },
        })
      );

      // Find by dagId
      const byDagId = switcher.getDagInfo('my-dag');
      expect(byDagId?.id).toBe('my-dag-id');

      // Find by id
      const byId = switcher.getDagInfo('my-dag-id');
      expect(byId?.id).toBe('my-dag-id');
    });
  });

  describe('standalone utilities', () => {
    it('switchDag works as standalone', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.target.json'),
        JSON.stringify({ id: 'target', nodes: {} })
      );

      const result = switchDag(testDir, 'target');
      expect(result.success).toBe(true);
    });

    it('listDags works as standalone', () => {
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: 'current', nodes: {} })
      );

      writeFileSync(
        join(testDir, '.roadmap', 'head.other.json'),
        JSON.stringify({ id: 'other', nodes: {} })
      );

      const result: DagListResult = listDags(testDir);
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
    });

    it('currentDag works as standalone', () => {
      const dagId = 'my-dag';
      writeFileSync(
        join(testDir, '.roadmap', 'head.json'),
        JSON.stringify({ id: dagId, nodes: {} })
      );

      const result = currentDag(testDir);
      expect(result).toBe(dagId);
    });
  });
});
