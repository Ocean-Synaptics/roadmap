import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRepairLog } from '../../src/lib/disconnect-repair/history';

describe('RepairHistoryLog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  it('records repair operations', () => {
    const log = createRepairLog(tmpDir);

    log.record({
      timestamp: Date.now(),
      operationId: 'op-1',
      type: 'move',
      target: 'file.ts',
      success: true,
      approver: 'user',
      rollbackInfo: { reversible: true, method: 'rename' },
    });

    const summary = log.summary();
    expect(summary.total).toBe(1);
    expect(summary.successful).toBe(1);
  });

  it('loads history from log file', () => {
    const log = createRepairLog(tmpDir);

    log.record({
      timestamp: Date.now(),
      operationId: 'op-2',
      type: 'update',
      target: 'file.ts',
      success: true,
      approver: 'auto',
    });

    const loaded = log.load();
    expect(loaded.length).toBeGreaterThan(0);
  });

  it('filters by success status', () => {
    const log = createRepairLog(tmpDir);

    log.record({
      timestamp: Date.now(),
      operationId: 'op-3',
      type: 'move',
      target: 'file1.ts',
      success: true,
      approver: 'user',
    });

    log.record({
      timestamp: Date.now(),
      operationId: 'op-4',
      type: 'delete',
      target: 'file2.ts',
      success: false,
      approver: 'user',
      error: 'File not found',
    });

    expect(log.getSuccessful().length).toBe(1);
    expect(log.getFailed().length).toBe(1);
  });

  it('provides repair summary', () => {
    const log = createRepairLog(tmpDir);

    log.record({
      timestamp: Date.now(),
      operationId: 'op-5',
      type: 'create',
      target: 'new.ts',
      success: true,
      approver: 'system',
    });

    const summary = log.summary();
    expect(summary.total).toBe(1);
    expect(summary.successful).toBe(1);
    expect(summary.failed).toBe(0);
  });
});
