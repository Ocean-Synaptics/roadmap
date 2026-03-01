import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createRunManifest } from '../../src/lib/sgk/run-manifest.ts';
import { writeStrategyReceipt } from '../../src/lib/sgk/receipts/strategy.ts';
import { writePlanReceipt } from '../../src/lib/sgk/receipts/plan.ts';
import { checkDispatchGates } from '../../src/lib/sgk/cli/dispatch-gates.ts';
import { runInitIntent } from '../../src/lib/sgk/cli/intent-init.ts';
import { checkIntentBinding } from '../../src/lib/sgk/intent-binding.ts';
import { bindNodeToRun } from '../../src/lib/sgk/cli/complete-binding.ts';
import { writeDisplay } from '../../src/lib/sgk/display.ts';
import { checkTermDisplayRequirement } from '../../src/lib/sgk/term-display-check.ts';
import { runTermIntent } from '../../src/lib/sgk/cli/intent-term.ts';
import { mineRun } from '../../src/lib/sgk/mine.ts';
import { auditRun } from '../../src/lib/sgk/audit.ts';
import { checkCloseGates } from '../../src/lib/sgk/cli/close-gates.ts';
import { writeCloseReceipt } from '../../src/lib/sgk/receipts/close.ts';
import { readIntentReceipt } from '../../src/lib/sgk/receipts/intent.ts';
import { readMineReceipt } from '../../src/lib/sgk/receipts/mine.ts';
import { readAuditReceipt } from '../../src/lib/sgk/receipts/audit.ts';

const RUN_ID = 'e2e-run-001';
const DAG_ID = 'test-dag';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `sgk-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const roadmapDir = join(dir, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'kernel.json'), JSON.stringify({
    requireRunId: false,
    allowDispatchAutoStrategy: true,
  }));
  return dir;
}

describe('SGK e2e run flow', () => {
  it('completes full 14-step lifecycle', () => {
    const root = makeTmpDir();

    // 1. Create RunManifest
    const manifest = createRunManifest(RUN_ID, DAG_ID, 'free-run-guard', {
      headSha: 'abc123', repoRoot: root, workerCount: 1,
      kernelSha: 'kshadef', registrySha: 'rshadef',
    });
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.dagId).toBe(DAG_ID);
    expect(existsSync(join(root, '.roadmap', 'runs', RUN_ID, 'RUN.json'))).toBe(true);

    // 2. Write StrategySelectionReceipt (manual to avoid kernel/registry deps)
    writeStrategyReceipt(root, {
      schema_version: 1, type: 'strategy-selection', runId: RUN_ID,
      selectionMode: 'auto', strategyId: 'validate-as-you-go',
      autoSelectEvidence: 'parallelism=1', strategyConfigSha: 'configsha',
      constraints: ['parallelismThreshold:2'],
      selectedAt: new Date().toISOString(),
    });

    // 3. Write PlanSelectionReceipt
    writePlanReceipt(root, {
      schema_version: 1, type: 'plan-selection', runId: RUN_ID,
      planId: 'plan-main', candidateSetDigest: 'digest-xyz',
      bindingSha: 'bsha-001', selectedAt: new Date().toISOString(),
    });

    // 4. checkDispatchGates — need init intent too
    // First run without init intent to verify partial state
    const gatesBefore = checkDispatchGates(root, RUN_ID);
    expect(gatesBefore.ok).toBe(false);
    expect(gatesBefore.missing).toContain('INIT_INTENT_MISSING');

    // 5. runInitIntent
    const initResult = runInitIntent(root, RUN_ID);
    expect(initResult.ok).toBe(true);
    expect(initResult.receiptPath).toBeDefined();
    const initReceipt = readIntentReceipt(root, RUN_ID, 'init');
    expect(initReceipt).not.toBeNull();
    expect(initReceipt!.gate).toBe('init');
    expect(initReceipt!.overallPass).toBe(true);

    // 4b. checkDispatchGates now passes
    const gatesAfter = checkDispatchGates(root, RUN_ID);
    expect(gatesAfter.ok).toBe(true);

    // 6. checkIntentBinding → no drift
    const binding = checkIntentBinding(root, RUN_ID);
    expect(binding.bound).toBe(true);
    expect(binding.driftDetected).toBe(false);

    // 7. bindNodeToRun
    const nodePath = bindNodeToRun(root, RUN_ID, 'node-a');
    expect(existsSync(nodePath)).toBe(true);
    const nodeBinding = JSON.parse(readFileSync(nodePath, 'utf-8'));
    expect(nodeBinding.nodeId).toBe('node-a');

    // 8. writeDisplay
    const displayPath = writeDisplay({
      runId: RUN_ID, repoRoot: root, cmd: 'chart', humanMode: true,
      blocks: [
        { type: 'chart', content: '[██████████] 100%' },
        { type: 'orient', content: 'position: node-a' },
      ],
    });
    expect(existsSync(displayPath)).toBe(true);

    // 9. checkTermDisplayRequirement
    const displayCheck = checkTermDisplayRequirement(root, RUN_ID);
    expect(displayCheck.satisfied).toBe(true);
    expect(displayCheck.displayReceiptId).toBeDefined();

    // 10. runTermIntent
    const termResult = runTermIntent(root, RUN_ID);
    expect(termResult.ok).toBe(true);
    expect(termResult.receiptPath).toBeDefined();
    const termReceipt = readIntentReceipt(root, RUN_ID, 'term');
    expect(termReceipt).not.toBeNull();
    expect(termReceipt!.gate).toBe('term');
    expect(termReceipt!.overallPass).toBe(true);

    // 11. mineRun
    const minePath = mineRun({
      runId: RUN_ID, repoRoot: root,
      toolCallLog: [
        { tool: 'read', durationMs: 15, nodeId: 'node-a' },
        { tool: 'write', durationMs: 45, nodeId: 'node-a' },
        { tool: 'read', durationMs: 120 },
      ],
    });
    expect(existsSync(minePath)).toBe(true);
    const mineReceipt = readMineReceipt(root, RUN_ID);
    expect(mineReceipt).not.toBeNull();
    expect(mineReceipt!.toolCallCounts.read).toBe(2);

    // 12. auditRun
    const auditPath = auditRun({ runId: RUN_ID, repoRoot: root });
    expect(existsSync(auditPath)).toBe(true);
    const auditReceipt = readAuditReceipt(root, RUN_ID);
    expect(auditReceipt).not.toBeNull();
    expect(auditReceipt!.overallPass).toBe(true);
    expect(auditReceipt!.verdicts.length).toBe(2);

    // 13. checkCloseGates
    const closeGates = checkCloseGates(root, RUN_ID);
    expect(closeGates.ok).toBe(true);
    expect(closeGates.missing).toHaveLength(0);

    // 14. writeCloseReceipt
    const closePath = writeCloseReceipt(root, {
      schema_version: 1, type: 'run-close', runId: RUN_ID, ok: true,
      requiredReceipts: { termIntent: true, mine: true, audit: true, display: true },
      closedAt: new Date().toISOString(),
    });
    expect(existsSync(closePath)).toBe(true);
    const closeReceipt = JSON.parse(readFileSync(closePath, 'utf-8'));
    expect(closeReceipt.ok).toBe(true);
    expect(closeReceipt.requiredReceipts.termIntent).toBe(true);
    expect(closeReceipt.requiredReceipts.mine).toBe(true);
    expect(closeReceipt.requiredReceipts.audit).toBe(true);
    expect(closeReceipt.requiredReceipts.display).toBe(true);
  });
});
