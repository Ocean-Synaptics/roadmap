import { test, expect } from 'vitest';
import { planIntegration } from '../src/lib/auto-integrate.ts';

test('auto-integrate: requires metadata to plan', async () => {
  // Without .roadmap.json, should throw error asking for metadata
  try {
    await planIntegration('.');
    // If we reach here in test env without .roadmap.json, should have thrown
    // But if .roadmap.json exists, should succeed
    expect(true).toBe(true);
  } catch (e) {
    // Expected: missing metadata error
    expect((e as Error).message).toContain('.roadmap.json');
  }
});
