import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { enforceClutterPrevention } from '../src/lib/enforcement/index';

describe('enforceClutterPrevention — Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join('/tmp', 'enforcement-'));
    mkdirSync(join(tempDir, 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('clean state', () => {
    it('should pass enforcement with no tasks, DAGs, or worktrees', () => {
      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(true);
      expect(report.violations).toHaveLength(0);
    });

    it('should report summary for clean state', () => {
      const report = enforceClutterPrevention(tempDir);
      expect(report.summary).toContain('passed');
    });

    it('should list all four rules', () => {
      const report = enforceClutterPrevention(tempDir);
      expect(report.rules).toHaveLength(4);
      expect(report.rules.map((r) => r.name)).toEqual([
        'dag-documentation',
        'design-doc-commitment',
        'task-list-hygiene',
        'worktree-cleanup',
      ]);
    });
  });

  describe('task validation integration', () => {
    it('should detect invalid tasks', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(false);

      const taskRule = report.rules.find((r) => r.name === 'task-list-hygiene');
      expect(taskRule?.passed).toBe(false);
      expect(taskRule?.violations.length).toBeGreaterThan(0);
    });

    it('should detect stale in_progress tasks', () => {
      const now = Date.now();
      writeFileSync(
        join(tempDir, 'tasks', 'stale.json'),
        JSON.stringify({
          id: 'stale',
          status: 'in_progress',
          updatedAt: new Date(now - 100 * 60 * 60 * 1000).toISOString(),
        })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(false);
    });

    it('should detect completed tasks missing evidence', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'no-evidence.json'),
        JSON.stringify({
          id: 'no-evidence',
          status: 'completed',
        })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(false);

      const violations = report.violations.filter((v) => v.rule === 'task-list-hygiene');
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('DAG validation integration', () => {
    it('should detect invalid DAG structure', () => {
      writeFileSync(
        join(tempDir, '.roadmap', 'head.bad.json'),
        JSON.stringify({ id: 'bad', desc: 'Missing fields' })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(false);

      const dagRule = report.rules.find((r) => r.name === 'dag-documentation');
      expect(dagRule?.passed).toBe(false);
    });

    it('should detect missing DAG documentation', () => {
      const validDag = {
        id: 'test-dag',
        desc: 'Test',
        init: 'start',
        term: 'end',
        nodes: {
          start: { id: 'start', desc: 'Start' },
          end: { id: 'end', desc: 'End' },
        },
      };

      // Create head.missing-doc.json without design doc
      writeFileSync(
        join(tempDir, '.roadmap', 'head.missing-doc.json'),
        JSON.stringify(validDag)
      );

      const report = enforceClutterPrevention(tempDir);
      // Should report missing design doc gap
      const dagRule = report.rules.find((r) => r.name === 'dag-documentation');
      expect(dagRule?.violations.some((v) => v.message.includes('design documentation'))).toBe(
        true
      );
    });

    it('should detect orphaned DAGs', () => {
      const activeDag = {
        id: 'active-dag',
        desc: 'Active',
        init: 'start',
        term: 'end',
        nodes: {
          start: { id: 'start', desc: 'Start' },
          end: { id: 'end', desc: 'End' },
        },
      };

      const orphanedDag = {
        id: 'old-dag',
        desc: 'Old',
        init: 'start',
        term: 'end',
        nodes: {
          start: { id: 'start', desc: 'Start' },
          end: { id: 'end', desc: 'End' },
        },
      };

      // Set active head
      writeFileSync(
        join(tempDir, '.roadmap', 'head.json'),
        JSON.stringify(activeDag)
      );

      // Create orphaned head.*.json
      writeFileSync(
        join(tempDir, '.roadmap', 'head.old.json'),
        JSON.stringify(orphanedDag)
      );

      const report = enforceClutterPrevention(tempDir);
      const dagRule = report.rules.find((r) => r.name === 'dag-documentation');
      expect(dagRule?.violations.some((v) => v.message.includes('orphaned'))).toBe(true);
    });
  });

  describe('combined enforcement', () => {
    it('should report multiple violations across rules', () => {
      // Invalid task
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      // Invalid DAG
      writeFileSync(
        join(tempDir, '.roadmap', 'head.bad.json'),
        JSON.stringify({ id: 'bad', desc: 'Incomplete' })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(false);
      expect(report.violations.length).toBeGreaterThan(1);
    });

    it('should pass when all four gates are clean', () => {
      const validDag = {
        id: 'test-dag',
        desc: 'Test DAG',
        init: 'start',
        term: 'end',
        nodes: {
          start: { id: 'start', desc: 'Start' },
          end: { id: 'end', desc: 'End' },
        },
      };

      writeFileSync(
        join(tempDir, '.roadmap', 'head.json'),
        JSON.stringify(validDag)
      );

      // Create design doc
      writeFileSync(
        join(tempDir, '.roadmap', 'test-dag-design.md'),
        '# Design Doc for test-dag\n'
      );

      // Valid task
      writeFileSync(
        join(tempDir, 'tasks', 'task1.json'),
        JSON.stringify({
          id: 'task1',
          status: 'pending',
        })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.allPassed).toBe(true);
      expect(report.violations).toHaveLength(0);
    });
  });

  describe('violation reporting', () => {
    it('should include remediation guidance in violations', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad-task', status: 'invalid' })
      );

      const report = enforceClutterPrevention(tempDir);
      const violation = report.violations[0];
      expect(violation.remediation).toBeTruthy();
    });

    it('should categorize violations by severity', () => {
      writeFileSync(
        join(tempDir, '.roadmap', 'head.orphan.json'),
        JSON.stringify({
          id: 'orphaned',
          desc: 'Orphaned DAG',
          init: 'a',
          term: 'z',
          nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
        })
      );

      writeFileSync(
        join(tempDir, '.roadmap', 'head.json'),
        JSON.stringify({
          id: 'active',
          desc: 'Active',
          init: 'a',
          term: 'z',
          nodes: { a: { id: 'a', desc: 'A' }, z: { id: 'z', desc: 'Z' } },
        })
      );

      const report = enforceClutterPrevention(tempDir);
      expect(report.violations.some((v) => v.severity === 'warning')).toBe(true);
    });
  });

  describe('rule isolation', () => {
    it('should isolate task failures from other rules', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      const report = enforceClutterPrevention(tempDir);
      const dagRule = report.rules.find((r) => r.name === 'dag-documentation');
      const taskRule = report.rules.find((r) => r.name === 'task-list-hygiene');

      expect(dagRule?.passed).toBe(true);
      expect(taskRule?.passed).toBe(false);
      expect(report.allPassed).toBe(false);
    });

    it('should isolate DAG failures from other rules', () => {
      writeFileSync(
        join(tempDir, '.roadmap', 'head.invalid.json'),
        JSON.stringify({ id: 'bad', desc: 'No init/term' })
      );

      const report = enforceClutterPrevention(tempDir);
      const dagRule = report.rules.find((r) => r.name === 'dag-documentation');
      const taskRule = report.rules.find((r) => r.name === 'task-list-hygiene');

      expect(dagRule?.passed).toBe(false);
      expect(taskRule?.passed).toBe(true);
      expect(report.allPassed).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should return consistent results across multiple calls', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'task1.json'),
        JSON.stringify({ id: 'task1', status: 'pending' })
      );

      const report1 = enforceClutterPrevention(tempDir);
      const report2 = enforceClutterPrevention(tempDir);

      expect(report1.allPassed).toBe(report2.allPassed);
      expect(report1.violations.length).toBe(report2.violations.length);
      expect(report1.summary).toBe(report2.summary);
    });
  });
});
