import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IntentDetector, detectIntentIssues } from '../../src/lib/disconnect-detector/intent-subsystem';

describe('IntentDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-detect-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('detects plan nodes without expansions', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'plan-node': {
            mode: 'plan',
            validate: [{ type: 'expanded', minNodes: 1 }],
          },
        },
      })
    );

    const detector = new IntentDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.detail.includes('expansion'))).toBe(true);
  });

  it('detects clarity gates', async () => {
    const roadmapDir = path.join(tmpDir, '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });

    fs.writeFileSync(
      path.join(roadmapDir, 'head.json'),
      JSON.stringify({
        nodes: {
          'init-node': {
            validate: [{ type: 'spec-conformance', scenario: 'Plan Clarity', expandOnFail: true }],
          },
        },
      })
    );

    const detector = new IntentDetector({ roadmapRoot: tmpDir });
    const issues = await detector.scan();

    expect(issues.some(i => i.detail.includes('clarity'))).toBe(true);
  });

  it('exposes detectIntentIssues function', async () => {
    const issues = await detectIntentIssues({ roadmapRoot: tmpDir });
    expect(Array.isArray(issues)).toBe(true);
  });
});
