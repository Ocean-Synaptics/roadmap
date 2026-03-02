import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  TaskValidator,
  validateTaskList,
  formatValidationReport,
  type TaskFile,
  type ValidationIssue,
} from '../src/lib/enforcement/task-list-validator';

describe('TaskValidator', () => {
  let tmpDir: string;
  let tasksDir: string;
  let validator: TaskValidator;

  beforeEach(() => {
    tmpDir = mkdtempSync('test-tasks-');
    tasksDir = join(tmpDir, 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    validator = new TaskValidator(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('should pass validation when no task files exist', () => {
    const result = validator.validate();
    expect(result.tasksScanned).toBe(0);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should scan and validate pending tasks', () => {
    const task: TaskFile = {
      id: 'task-1',
      subject: 'Test pending task',
      status: 'pending',
      description: 'A task in pending state',
    };
    writeFileSync(join(tasksDir, 'task-1.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.tasksScanned).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect invalid status values', () => {
    const task: TaskFile = {
      id: 'task-invalid',
      subject: 'Invalid status task',
      status: 'blocked', // invalid
      description: 'This status is not allowed',
    };
    writeFileSync(join(tasksDir, 'task-invalid.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.passed).toBe(false);
    expect(result.invalidStatusCount).toBe(1);
    expect(result.issues).toHaveLength(1);

    const issue = result.issues[0];
    expect(issue.code).toBe('INVALID_STATUS');
    expect(issue.severity).toBe('error');
  });

  it('should detect stale in_progress tasks (> 48h old)', () => {
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-recent',
      subject: 'Recently updated task',
      status: 'in_progress',
      updatedAt: twoHoursAgo,
    };
    writeFileSync(join(tasksDir, 'task-recent.json'), JSON.stringify(task));

    const result = validator.validate(now);
    expect(result.passed).toBe(true); // Not yet stale
    expect(result.staleCount).toBe(0);
  });

  it('should flag in_progress tasks older than 48 hours', () => {
    const now = Date.now();
    const threeHoursAgo = new Date(now - 49 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-stale',
      subject: 'Stale in-progress task',
      status: 'in_progress',
      updatedAt: threeHoursAgo,
    };
    writeFileSync(join(tasksDir, 'task-stale.json'), JSON.stringify(task));

    const result = validator.validate(now);
    expect(result.passed).toBe(false);
    expect(result.staleCount).toBe(1);

    const issue = result.issues[0];
    expect(issue.code).toBe('STALE_IN_PROGRESS');
    expect(issue.severity).toBe('warning');
  });

  it('should use createdAt as fallback for stale detection when updatedAt missing', () => {
    const now = Date.now();
    const threeHoursAgo = new Date(now - 49 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-no-update',
      subject: 'Task without updatedAt',
      status: 'in_progress',
      createdAt: threeHoursAgo,
    };
    writeFileSync(join(tasksDir, 'task-no-update.json'), JSON.stringify(task));

    const result = validator.validate(now);
    expect(result.staleCount).toBe(1);
  });

  it('should require evidence field for completed tasks', () => {
    const task: TaskFile = {
      id: 'task-no-evidence',
      subject: 'Completed without evidence',
      status: 'completed',
      description: 'This task is marked complete but has no evidence',
    };
    writeFileSync(join(tasksDir, 'task-no-evidence.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.passed).toBe(false);
    expect(result.missingEvidenceCount).toBe(1);

    const issue = result.issues[0];
    expect(issue.code).toBe('MISSING_EVIDENCE');
    expect(issue.severity).toBe('error');
  });

  it('should accept evidence as string for completed tasks', () => {
    const task: TaskFile = {
      id: 'task-with-evidence-string',
      subject: 'Completed with evidence (string)',
      status: 'completed',
      evidence: 'Completion verified by commit abc123',
    };
    writeFileSync(join(tasksDir, 'task-with-evidence-string.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.passed).toBe(true);
    expect(result.missingEvidenceCount).toBe(0);
  });

  it('should accept evidence as array for completed tasks', () => {
    const task: TaskFile = {
      id: 'task-with-evidence-array',
      subject: 'Completed with evidence (array)',
      status: 'completed',
      evidence: ['Test passed: 100%', 'Commit: abc123', 'Review: approved'],
    };
    writeFileSync(join(tasksDir, 'task-with-evidence-array.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.passed).toBe(true);
  });

  it('should skip malformed JSON files gracefully', () => {
    writeFileSync(join(tasksDir, 'task-bad.json'), '{invalid json}');

    const task: TaskFile = {
      id: 'task-good',
      subject: 'Valid task',
      status: 'pending',
    };
    writeFileSync(join(tasksDir, 'task-good.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.tasksScanned).toBe(2); // Both files scanned
    expect(result.passed).toBe(true); // Bad JSON ignored, good task valid
  });

  it('should ignore non-JSON files', () => {
    writeFileSync(join(tasksDir, 'readme.txt'), 'This is not a task');

    const result = validator.validate();
    expect(result.tasksScanned).toBe(0); // .txt not counted
  });

  it('should detect multiple issues on same task', () => {
    const task: TaskFile = {
      id: 'task-multiple-issues',
      subject: 'Multiple issues',
      status: 'invalid_status', // invalid status
      // completed but no evidence (if status was valid)
    };
    writeFileSync(join(tasksDir, 'task-multiple-issues.json'), JSON.stringify(task));

    const result = validator.validate();
    expect(result.passed).toBe(false);
    // Should report at least the invalid status
    expect(result.issues.some(i => i.code === 'INVALID_STATUS')).toBe(true);
  });

  it('should detect multiple tasks with different issues', () => {
    const taskInvalid: TaskFile = {
      id: 'task-invalid',
      status: 'unknown',
    };
    const taskStale: TaskFile = {
      id: 'task-stale',
      status: 'in_progress',
      updatedAt: new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(),
    };
    const taskNoEvidence: TaskFile = {
      id: 'task-no-ev',
      status: 'completed',
    };

    writeFileSync(join(tasksDir, 'task-invalid.json'), JSON.stringify(taskInvalid));
    writeFileSync(join(tasksDir, 'task-stale.json'), JSON.stringify(taskStale));
    writeFileSync(join(tasksDir, 'task-no-ev.json'), JSON.stringify(taskNoEvidence));

    const result = validator.validate();
    expect(result.tasksScanned).toBe(3);
    expect(result.passed).toBe(false);
    expect(result.invalidStatusCount).toBeGreaterThan(0);
    expect(result.staleCount).toBeGreaterThan(0);
    expect(result.missingEvidenceCount).toBeGreaterThan(0);
  });

  it('should handle custom stale duration', () => {
    const tmpDir2 = mkdtempSync('test-tasks-custom-');
    const tasksDir2 = join(tmpDir2, 'tasks');
    mkdirSync(tasksDir2, { recursive: true });

    // Custom: stale after 1 hour
    const validatorCustom = new TaskValidator(tmpDir2, 1 * 60 * 60 * 1000);

    const now = Date.now();
    const halfHourAgo = new Date(now - 30 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-1h-custom',
      status: 'in_progress',
      updatedAt: halfHourAgo,
    };
    writeFileSync(join(tasksDir2, 'task-1h-custom.json'), JSON.stringify(task));

    const result = validatorCustom.validate(now);
    expect(result.passed).toBe(true); // Not yet 1 hour old

    rmSync(tmpDir2, { recursive: true });
  });
});

describe('validateTaskList', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync('test-tasks-func-');
    mkdirSync(join(tmpDir, 'tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('should return true when all tasks valid', () => {
    const task: TaskFile = {
      id: 'task-valid',
      status: 'pending',
    };
    writeFileSync(join(tmpDir, 'tasks', 'task-valid.json'), JSON.stringify(task));

    const passed = validateTaskList(tmpDir);
    expect(passed).toBe(true);
  });

  it('should return false when validation fails', () => {
    const task: TaskFile = {
      id: 'task-invalid',
      status: 'invalid',
    };
    writeFileSync(join(tmpDir, 'tasks', 'task-invalid.json'), JSON.stringify(task));

    const passed = validateTaskList(tmpDir);
    expect(passed).toBe(false);
  });
});

describe('formatValidationReport', () => {
  it('should format successful validation', () => {
    const result = {
      tasksScanned: 5,
      issues: [],
      staleCount: 0,
      invalidStatusCount: 0,
      missingEvidenceCount: 0,
      passed: true,
    };

    const report = formatValidationReport(result);
    expect(report).toContain('✓');
    expect(report).toContain('Task list validation passed');
    expect(report).toContain('5 tasks scanned');
  });

  it('should format failed validation with issues', () => {
    const issues: ValidationIssue[] = [
      {
        taskId: 'task-1',
        severity: 'error',
        code: 'INVALID_STATUS',
        message: 'Task status must be pending/in_progress/completed',
      },
      {
        taskId: 'task-2',
        severity: 'warning',
        code: 'STALE_IN_PROGRESS',
        message: 'Task in_progress for > 48h without update',
      },
    ];

    const result = {
      tasksScanned: 10,
      issues,
      staleCount: 1,
      invalidStatusCount: 1,
      missingEvidenceCount: 0,
      passed: false,
    };

    const report = formatValidationReport(result);
    expect(report).toContain('✗');
    expect(report).toContain('Task list validation failed');
    expect(report).toContain('task-1');
    expect(report).toContain('INVALID_STATUS');
    expect(report).toContain('task-2');
    expect(report).toContain('STALE_IN_PROGRESS');
    expect(report).toContain('1 stale');
    expect(report).toContain('1 invalid status');
  });
});

describe('detectStaleTask', () => {
  let tmpDir: string;
  let validator: TaskValidator;

  beforeEach(() => {
    tmpDir = mkdtempSync('test-stale-');
    mkdirSync(join(tmpDir, 'tasks'), { recursive: true });
    validator = new TaskValidator(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it('should not flag pending tasks as stale', () => {
    const now = Date.now();
    const oldTime = new Date(now - 100 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-old-pending',
      status: 'pending',
      updatedAt: oldTime,
    };

    const stale = validator.detectStaleTask(task, 'task-old-pending', now);
    expect(stale.isStale).toBe(false);
  });

  it('should not flag completed tasks as stale', () => {
    const now = Date.now();
    const oldTime = new Date(now - 100 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-old-completed',
      status: 'completed',
      updatedAt: oldTime,
    };

    const stale = validator.detectStaleTask(task, 'task-old-completed', now);
    expect(stale.isStale).toBe(false);
  });

  it('should calculate hours since update correctly', () => {
    const now = Date.now();
    const thirtyHoursAgo = new Date(now - 30 * 60 * 60 * 1000).toISOString();

    const task: TaskFile = {
      id: 'task-30h-old',
      status: 'in_progress',
      updatedAt: thirtyHoursAgo,
    };

    const stale = validator.detectStaleTask(task, 'task-30h-old', now);
    expect(stale.isStale).toBe(false); // Not yet 48 hours
    expect(stale.hoursSinceUpdate).toBeCloseTo(30, 0);
  });

  it('should handle invalid timestamp gracefully', () => {
    const task: TaskFile = {
      id: 'task-bad-timestamp',
      status: 'in_progress',
      updatedAt: 'not a valid timestamp',
    };

    const stale = validator.detectStaleTask(task, 'task-bad-timestamp', Date.now());
    expect(stale.isStale).toBe(true); // Invalid timestamp = assume stale
  });

  it('should assume stale when no timestamp present', () => {
    const task: TaskFile = {
      id: 'task-no-timestamp',
      status: 'in_progress',
    };

    const stale = validator.detectStaleTask(task, 'task-no-timestamp', Date.now());
    expect(stale.isStale).toBe(true);
    expect(stale.hoursSinceUpdate).toBeUndefined();
  });
});
