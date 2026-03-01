import { describe, it, expect } from 'vitest';
import { ErrorRecoveryStrategy } from '../src/lib/enforcement/error-recovery.ts';
import { ArtifactSchemaValidator, ProcessInvariantValidator, ConcurrentSafetyValidator } from '../src/lib/enforcement/validators.ts';
import { StateMachine, StateTransitionLog } from '../src/lib/enforcement/state-machine.ts';
import { RaceDetector, LockManager, AtomicWriter, ConcurrencyController } from '../src/lib/enforcement/concurrent-safety.ts';

describe('batch 2 — mechanical enforcement', () => {
  it('error recovery strategies execute successfully', async () => {
    const strategy = new ErrorRecoveryStrategy('.');
    const result = await strategy.gracefulDegrade(new Error('test'), {});
    expect(result.success).toBe(true);
    expect(result.action).toBe('graceful-degrade');
  });

  it('artifact schema validator works', () => {
    const validator = new ArtifactSchemaValidator();
    const result = validator.validate('/nonexistent', '/nonexistent.schema');
    expect(result.passed).toBe(false);
  });

  it('process invariant validator checks determinism', () => {
    const validator = new ProcessInvariantValidator();
    const result = validator.validateDeterminism([{ x: 1 }, { x: 1 }]);
    expect(result.passed).toBe(true);
  });

  it('concurrent safety validator checks locks', () => {
    const validator = new ConcurrentSafetyValidator();
    const result = validator.validateFileLocks([]);
    expect(result.passed).toBe(true);
  });

  it('state machine validates legal transitions', () => {
    const sm = new StateMachine();
    expect(sm.isLegalTransition('init', 'pending')).toBe(true);
    expect(sm.isLegalTransition('pending', 'executing')).toBe(false);
  });

  it('state transition log records transitions', () => {
    const log = new StateTransitionLog();
    log.record({
      nodeId: 'test',
      from: 'init',
      to: 'pending',
      timestamp: new Date().toISOString(),
      evidence: {},
    });
    expect(log.getCurrentState('test')).toBe('pending');
  });

  it('race detector initializes', () => {
    const detector = new RaceDetector();
    expect(detector.detectRaceCondition('/nonexistent')).toBe(false);
  });

  it('concurrency controller tracks active operations', async () => {
    const controller = new ConcurrencyController(1);
    let executed = false;
    await controller.runExclusive('test', async () => {
      executed = true;
    });
    expect(executed).toBe(true);
    expect(controller.getMetrics().activeOperations).toBe(0);
  });
});
