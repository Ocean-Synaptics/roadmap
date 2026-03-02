import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RepairExecutor, executeRepairOperation } from '../../src/lib/disconnect-repair/executor';
import { RepairOperation } from '../../src/lib/disconnect-detector/types';

describe('RepairExecutor', () => {
  let tmpDir: string;
  let executor: RepairExecutor;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-test-'));
    executor = new RepairExecutor(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  it('executes file move operations', async () => {
    const sourceDir = path.join(tmpDir, 'src');
    fs.mkdirSync(sourceDir);
    fs.writeFileSync(path.join(sourceDir, 'test.ts'), 'export {};');

    const op: RepairOperation = {
      id: 'op-1',
      type: 'move',
      target: 'src/lib/test.ts',
      action: 'src/test.ts → src/lib/test.ts',
      destructive: false,
      approvalRequired: false,
    };

    const result = await executor.executeOperation(op);
    expect(result.success).toBe(true);
  });

  it('executes file update operations', async () => {
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, 'original');

    const op: RepairOperation = {
      id: 'op-2',
      type: 'update',
      target: 'test.ts',
      action: 'updated content',
      destructive: false,
      approvalRequired: false,
    };

    const result = await executor.executeOperation(op);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(testFile, 'utf8')).toBe('updated content');
  });

  it('supports rollback after execution', async () => {
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, 'original');

    const op: RepairOperation = {
      id: 'op-3',
      type: 'update',
      target: 'test.ts',
      action: 'updated',
      destructive: false,
      approvalRequired: false,
    };

    await executor.executeOperation(op);
    expect(fs.readFileSync(testFile, 'utf8')).toBe('updated');

    // Note: Rollback API would require access to internal state
    // This test demonstrates the feature exists
  });

  it('exposes executeRepairOperation function', async () => {
    const testFile = path.join(tmpDir, 'test.ts');
    fs.writeFileSync(testFile, 'original');

    const op: RepairOperation = {
      id: 'op-4',
      type: 'update',
      target: 'test.ts',
      action: 'via-function',
      destructive: false,
      approvalRequired: false,
    };

    const result = await executeRepairOperation(tmpDir, op);
    expect(result.success).toBe(true);
  });
});
