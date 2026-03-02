import { describe, it, expect } from 'vitest';
import { validatePostRepair, PostRepairValidator } from '../../src/lib/disconnect-repair/post-repair-validation';

describe('PostRepairValidator', () => {
  it('validates post-repair state', async () => {
    const validator = new PostRepairValidator(process.cwd());
    const report = await validator.validate();

    expect(report).toBeDefined();
    expect(report.timestamp).toBeGreaterThan(0);
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
  });

  it('includes TypeScript check', async () => {
    const validator = new PostRepairValidator(process.cwd());
    const report = await validator.validate();

    const tsCheck = report.checks.find(c => c.name === 'TypeScript Compilation');
    expect(tsCheck).toBeDefined();
  });

  it('includes file structure check', async () => {
    const validator = new PostRepairValidator(process.cwd());
    const report = await validator.validate();

    const structCheck = report.checks.find(c => c.name === 'File Structure');
    expect(structCheck).toBeDefined();
  });

  it('exposes validatePostRepair function', async () => {
    const report = await validatePostRepair(process.cwd());
    expect(report.checks).toBeDefined();
  });
});
