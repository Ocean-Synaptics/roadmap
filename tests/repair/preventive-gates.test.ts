import { describe, it, expect } from 'vitest';
import { enforcePreventiveGates } from '../../src/lib/disconnect-repair/preventive-gates';

describe('PreventiveGateManager', () => {
  it('enforces preventive gates', async () => {
    const result = await enforcePreventiveGates();
    expect(result).toBeDefined();
    expect(result.passed).toBeDefined();
    expect(Array.isArray(result.violations)).toBe(true);
  });
});
