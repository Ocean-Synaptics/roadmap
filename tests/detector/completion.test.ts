import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CompletionDetector, detectCompletionIssues } from '../../src/lib/disconnect-detector/completion-subsystem';

describe('CompletionDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects missing produce artifacts', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'completed.json'),
      JSON.stringify({
        nodes: {
          'test-node': {
            produces: ['src/missing.ts'],
          },
        },
      })
    );

    const detector = new CompletionDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.type === 'completion-mismatch')).toBe(true);
  });

  it('detects stale completion records', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'completed.json'),
      JSON.stringify({
        lastUpdated: Date.now() - 40 * 24 * 60 * 60 * 1000,
      })
    );

    const detector = new CompletionDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.type === 'stale-head')).toBe(true);
  });

  it('exposes detectCompletionIssues function', async () => {
    const issues = await detectCompletionIssues({ roadmapRoot: tmpDir });
    expect(Array.isArray(issues)).toBe(true);
  });
});
