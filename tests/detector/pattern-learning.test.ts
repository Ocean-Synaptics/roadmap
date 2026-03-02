import { describe, it, expect } from 'vitest';
import { learnDisconnectPatterns } from '../../src/lib/disconnect-detector/pattern-learning';

describe('PatternLearner', () => {
  it('identifies common disconnect patterns', async () => {
    const patterns = await learnDisconnectPatterns(process.cwd());
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('patterns include prevention steps', async () => {
    const patterns = await learnDisconnectPatterns(process.cwd());
    patterns.forEach(p => {
      expect(Array.isArray(p.preventionSteps)).toBe(true);
    });
  });
});
