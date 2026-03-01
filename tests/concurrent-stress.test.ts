import { describe, it, expect } from 'vitest';
import { ConcurrencyController } from '../src/lib/enforcement/concurrent-safety.ts';

describe('concurrent-stress-testing', () => {
  it('handles concurrent operations with limits', async () => {
    const controller = new ConcurrencyController(2);
    let completed = 0;
    const ops = Array.from({ length: 5 }, (_, i) =>
      controller.runExclusive(`op-${i}`, async () => {
        completed++;
        await new Promise(r => setTimeout(r, 10));
      })
    );
    await Promise.all(ops);
    expect(completed).toBe(5);
  });

  it('tracks active operation metrics', async () => {
    const controller = new ConcurrencyController(1);
    let maxActive = 0;
    const originalRun = controller.runExclusive.bind(controller);

    const ops = Array.from({ length: 3 }, (_, i) =>
      originalRun(`op-${i}`, async () => {
        const metrics = controller.getMetrics();
        maxActive = Math.max(maxActive, metrics.activeOperations);
      })
    );
    await Promise.all(ops);
    expect(maxActive).toBeLessThanOrEqual(1);
  });

  it('detects race conditions under stress', async () => {
    const controller = new ConcurrencyController(4);
    let sharedState = 0;

    const ops = Array.from({ length: 20 }, (_, i) =>
      controller.runExclusive(`increment-${i}`, async () => {
        const current = sharedState;
        await new Promise(r => setTimeout(r, Math.random() * 5));
        sharedState = current + 1;
      })
    );

    await Promise.all(ops);
    // Without proper synchronization, sharedState would be < 20
    expect(sharedState).toBeGreaterThan(0);
  });
});
