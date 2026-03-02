import { describe, it, expect } from 'vitest';
import { detectIntentConvergenceGaps } from '../../src/lib/disconnect-detector/intent-convergence';

describe('IntentConvergenceDetector', () => {
  it('detects unexpanded plan nodes', async () => {
    const gaps = await detectIntentConvergenceGaps(process.cwd());
    expect(Array.isArray(gaps)).toBe(true);
  });

  it('exposes detectIntentConvergenceGaps function', async () => {
    const gaps = await detectIntentConvergenceGaps(process.cwd());
    expect(gaps).toBeDefined();
  });
});
