import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ValidationDetector, detectValidationIssues } from '../../src/lib/disconnect-detector/validation-subsystem';

describe('ValidationDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validation-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects missing validation rule fields', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'test-node': {
            validate: [{ type: 'artifact-exists' }], // missing 'path'
          },
        },
      })
    );

    const detector = new ValidationDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.type === 'state-divergence')).toBe(true);
  });

  it('detects missing spec files', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'test-node': {
            validate: [{ type: 'spec-conformance', spec: '.specify/missing.md', scenario: 'Test' }],
          },
        },
      })
    );

    const detector = new ValidationDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.severity === 'error')).toBe(true);
  });

  it('exposes detectValidationIssues function', async () => {
    const issues = await detectValidationIssues({ roadmapRoot: tmpDir });
    expect(Array.isArray(issues)).toBe(true);
  });
});
