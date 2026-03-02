import { describe, it, expect } from 'vitest';
import { ApprovalGate, requestRepairApproval } from '../../src/lib/disconnect-repair/approval';
import { RepairOperation } from '../../src/lib/disconnect-detector/types';

describe('ApprovalGate', () => {
  it('auto-approves non-destructive operations', async () => {
    const gate = new ApprovalGate();
    const op: RepairOperation = {
      id: 'op-1',
      type: 'update',
      target: 'file.ts',
      action: 'content',
      destructive: false,
      approvalRequired: false,
    };

    const decision = await gate.requestApproval({
      operation: op,
      requester: 'test',
      timestamp: Date.now(),
      reason: 'Test',
    });

    expect(decision.approved).toBe(true);
    expect(decision.approver).toBe('auto-approval');
  });

  it('flags destructive operations for manual approval', async () => {
    const gate = new ApprovalGate();
    const op: RepairOperation = {
      id: 'op-2',
      type: 'delete',
      target: 'file.ts',
      action: 'delete',
      destructive: true,
      approvalRequired: true,
    };

    const decision = await gate.requestApproval({
      operation: op,
      requester: 'test',
      timestamp: Date.now(),
      reason: 'Test',
    });

    expect(decision.approved).toBe(false);
  });

  it('exposes requestRepairApproval function', async () => {
    const op: RepairOperation = {
      id: 'op-3',
      type: 'move',
      target: 'file.ts',
      action: 'move',
      destructive: false,
      approvalRequired: false,
    };

    const decision = await requestRepairApproval(op, 'tester', 'Testing');
    expect(decision).toBeDefined();
  });
});
