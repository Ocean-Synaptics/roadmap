import { describe, it, expect } from 'vitest';
import { STRATEGIES, getStrategy, listStrategies } from '../../src/lib/strategy/registry.js';
import type { StrategyConfig } from '../../src/lib/strategy/schema.js';

describe('strategy registry', () => {
  it('contains exactly 3 strategies', () => {
    expect(STRATEGIES).toHaveLength(3);
  });

  it('listStrategies returns all strategies', () => {
    const all = listStrategies();
    expect(all).toHaveLength(3);
    expect(all.map(s => s.id)).toEqual([
      'hallucinate-rounds-then-validate',
      'validate-as-you-go',
      'hybrid',
    ]);
  });

  it('getStrategy returns matching config', () => {
    const s = getStrategy('validate-as-you-go');
    expect(s).toBeDefined();
    expect(s!.gateMode).toBe('per-batch');
    expect(s!.rounds).toBe(1);
    expect(s!.estimatedRisk).toBe('low');
  });

  it('getStrategy returns undefined for unknown id', () => {
    expect(getStrategy('nonexistent')).toBeUndefined();
  });

  it('all strategies have valid shape', () => {
    for (const s of STRATEGIES) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.desc).toBeTruthy();
      expect(s.rounds).toBeGreaterThan(0);
      expect(['per-batch', 'per-phase', 'terminal']).toContain(s.gateMode);
      expect(s.allowedBypasses).toEqual([]);
      expect(['low', 'medium', 'high']).toContain(s.estimatedRisk);
    }
  });

  it('HALLUCINATE_ROUNDS_THEN_VALIDATE has correct config', () => {
    const s = getStrategy('hallucinate-rounds-then-validate')!;
    expect(s.name).toBe('HALLUCINATE_ROUNDS_THEN_VALIDATE');
    expect(s.rounds).toBe(2);
    expect(s.gateMode).toBe('terminal');
    expect(s.estimatedRisk).toBe('medium');
  });
});
