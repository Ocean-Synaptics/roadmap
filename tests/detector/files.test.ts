import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileDetector, detectFileIssues } from '../../src/lib/disconnect-detector/file-subsystem';

describe('FileDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects orphaned test files', async () => {
    const testDir = path.join(tmpDir, 'tests');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'orphan.test.ts'), 'export {}');

    const detector = new FileDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.type === 'orphan')).toBe(true);
  });

  it('detects misplaced source files in root', async () => {
    fs.writeFileSync(path.join(tmpDir, 'root-file.ts'), 'export {}');

    const detector = new FileDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.category === 'misplaced')).toBe(true);
  });

  it('exposes detectFileIssues function', async () => {
    const issues = await detectFileIssues({ roadmapRoot: tmpDir });
    expect(Array.isArray(issues)).toBe(true);
  });
});
