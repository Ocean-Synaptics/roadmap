import { describe, it, expect } from 'vitest';
import { runFullyIntegratedRepair } from '../../src/lib/disconnect-repair/integration';

describe('FullyIntegratedRepair', () => {
  it('runs full repair cycle', async () => {
    const result = await runFullyIntegratedRepair(process.cwd());
    expect(result).toBeDefined();
  });

  it('includes detection phase', async () => {
    const result = await runFullyIntegratedRepair(process.cwd());
    expect(result.detection).toBeDefined();
  });

  it('includes validation phase', async () => {
    const result = await runFullyIntegratedRepair(process.cwd());
    expect(result.validation).toBeDefined();
  });
});
