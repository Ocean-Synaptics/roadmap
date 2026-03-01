import { describe, it, expect } from 'vitest';
import { StateMachine } from '../src/lib/enforcement/state-machine.ts';
import { ValidateCLI } from '../src/lib/enforcement/cli-integration.ts';
import { StreamingValidator } from '../src/lib/optimization/streaming.ts';

describe('integration-enforcement-test', () => {
  it('full validation pipeline: state machine + validators + CLI', async () => {
    const sm = new StateMachine();
    const cli = new ValidateCLI();
    const validator = new StreamingValidator();

    // State machine validates transitions
    expect(sm.isLegalTransition('pending', 'claimed')).toBe(true);

    // CLI validates rules
    const report = await cli.validate('test-node', [
      { type: 'artifact-exists', target: 'test.json' },
    ]);
    expect(report.nodeId).toBe('test-node');

    // Streaming validator processes items
    const items = [{ id: 'item-1' }, { id: 'item-2' }];
    const results = [];
    for await (const result of validator.validateStream(items)) {
      results.push(result);
    }
    expect(results.length).toBe(2);
  });

  it('enforces state transitions through complete cycle', () => {
    const sm = new StateMachine();
    const states: any[] = ['init', 'pending', 'claimed', 'executing', 'validated', 'complete'];

    for (let i = 0; i < states.length - 1; i++) {
      expect(sm.isLegalTransition(states[i], states[i + 1])).toBe(true);
    }
  });

  it('detects illegal transitions in batch', () => {
    const sm = new StateMachine();
    const illegalPairs = [
      ['init', 'complete'],
      ['pending', 'executing'],
      ['complete', 'pending'],
    ];

    for (const [from, to] of illegalPairs) {
      expect(sm.isLegalTransition(from as any, to as any)).toBe(false);
    }
  });

  it('validates full DAG with multiple nodes', async () => {
    const nodeIds = ['node-1', 'node-2', 'node-3', 'node-4'];
    const cli = new ValidateCLI();

    const reports = await cli.validateAll(nodeIds);
    expect(reports.length).toBe(4);
    expect(reports.every(r => r.passed)).toBe(true);
  });

  it('tracks metrics during streaming validation', async () => {
    const validator = new StreamingValidator();
    const items = Array.from({ length: 100 }, (_, i) => ({ id: `item-${i}` }));

    for await (const result of validator.validateStream(items)) {
      // Just iterate through
    }

    const stats = validator.getStats();
    expect(stats.totalProcessed).toBe(100);
    expect(stats.successCount).toBe(100);
  });
});
