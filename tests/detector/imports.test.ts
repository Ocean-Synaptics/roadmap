import { describe, it, expect } from 'vitest';
import { ImportDetector, detectImportIssues } from '../../src/lib/disconnect-detector/import-subsystem';

describe('ImportDetector', () => {
  it('detects import issues', async () => {
    const detector = new ImportDetector({ roadmapRoot: process.cwd() });
    const issues = await detector.scan();
    expect(Array.isArray(issues)).toBe(true);
  });

  it('exposes detectImportIssues function', async () => {
    const issues = await detectImportIssues({ roadmapRoot: process.cwd() });
    expect(Array.isArray(issues)).toBe(true);
  });
});
