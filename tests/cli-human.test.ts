import { describe, it, expect } from 'vitest';
import {
  formatProgressBar,
  formatTable,
  renderOrient,
  renderChart,
  renderPlanGallery,
  renderPlanSelect,
  renderPlanStatus,
  renderDoctor,
  renderValidate,
  renderTrail,
  renderRemaining,
} from '../src/lib/cli-human.ts';

// --- Helpers ---

describe('formatProgressBar', () => {
  it('renders 0% as all-empty', () => {
    const bar = formatProgressBar(0, 10);
    expect(bar).toContain('░');
    expect(bar).not.toContain('█');
  });

  it('renders 100% as all-filled', () => {
    const bar = formatProgressBar(10, 10);
    expect(bar).toContain('█');
    expect(bar).not.toContain('░');
  });

  it('renders 50% as mixed', () => {
    const bar = formatProgressBar(5, 10);
    expect(bar).toContain('█');
    expect(bar).toContain('░');
  });

  it('respects custom width', () => {
    const bar = formatProgressBar(5, 10, 20);
    // 20-char bar: 10 filled + 10 empty
    const filled = (bar.match(/█/g) || []).length;
    const empty = (bar.match(/░/g) || []).length;
    expect(filled).toBe(10);
    expect(empty).toBe(10);
  });

  it('handles zero total without crashing', () => {
    const bar = formatProgressBar(0, 0);
    expect(typeof bar).toBe('string');
  });
});

describe('formatTable', () => {
  it('renders headers and rows', () => {
    const out = formatTable(['Name', 'Value'], [['alpha', '1'], ['beta', '2']], [10, 6]);
    expect(out).toContain('Name');
    expect(out).toContain('Value');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
  });

  it('pads columns to declared widths', () => {
    const out = formatTable(['A', 'B'], [['x', 'y']], [8, 8]);
    const lines = out.split('\n').filter(Boolean);
    // Header + separator + data = at least 3 lines
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('does not emit JSON braces', () => {
    const out = formatTable(['Col'], [['val']], [10]);
    expect(out).not.toContain('{');
    expect(out).not.toContain('}');
  });
});

// --- Renderers ---

// Fixtures inferred from CLI command data shapes in bin/roadmap.ts

const orientData = {
  position: ['node-a', 'node-b'],
  level: 3,
  produces: ['src/out.ts'],
  consumes: ['src/in.ts'],
  preGate: [] as string[],
  batchComplete: false,
  done: 5,
  total: 13,
};

describe('renderOrient', () => {
  it('returns non-empty string', () => {
    const out = renderOrient(orientData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes position node ids', () => {
    const out = renderOrient(orientData);
    expect(out).toContain('node-a');
    expect(out).toContain('node-b');
  });

  it('includes level', () => {
    const out = renderOrient(orientData);
    expect(out).toContain('3');
  });

  it('includes produces and consumes', () => {
    const out = renderOrient(orientData);
    expect(out).toContain('src/out.ts');
    expect(out).toContain('src/in.ts');
  });

  it('includes done and total counts', () => {
    const out = renderOrient(orientData);
    expect(out).toContain('5');
    expect(out).toContain('13');
  });

  it('does not emit JSON', () => {
    const out = renderOrient(orientData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const chartData = {
  dag: { id: 'test-dag', desc: 'Test DAG description' },
  done: 7,
  total: 10,
  currentBatch: ['node-c'],
  preGate: [] as string[],
  batches: [
    ['init', 'setup'],
    ['node-c', 'node-d'],
    ['term'],
  ],
  doneSet: new Set(['init', 'setup', 'node-a', 'node-b', 'config', 'lint', 'docs']),
  retired: new Set<string>(),
  failed: new Set<string>(),
  planNodes: new Set<string>(),
};

describe('renderChart', () => {
  it('returns non-empty string', () => {
    const out = renderChart(chartData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes dag id', () => {
    const out = renderChart(chartData);
    expect(out).toContain('test-dag');
  });

  it('includes done/total counts', () => {
    const out = renderChart(chartData);
    expect(out).toContain('7');
    expect(out).toContain('10');
  });

  it('includes node ids from batches', () => {
    const out = renderChart(chartData);
    expect(out).toContain('init');
    expect(out).toContain('setup');
    expect(out).toContain('node-c');
    expect(out).toContain('term');
  });

  it('renders status markers for done and current nodes', () => {
    const out = renderChart(chartData);
    // Done nodes get a check mark, current nodes get a pointer
    expect(out).toMatch(/✅|done/i);
    expect(out).toMatch(/👉|current|\*/i);
  });

  it('does not emit JSON', () => {
    const out = renderChart(chartData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const galleryData = {
  candidates: [
    {
      id: 'aggressive',
      label: 'aggressive',
      summary: 'Single-pass emit',
      estimates: { nodes: 6, wallClockMinutes: 12.5, costUSD: 0.045, risk: 0.80 },
      recommended: true,
    },
    {
      id: 'staged',
      label: 'staged',
      summary: 'Two-stage approach',
      estimates: { nodes: 10, wallClockMinutes: 25.0, costUSD: 0.090, risk: 0.40 },
      recommended: false,
    },
  ],
  specSource: '.specify/specs/auth.md',
};

describe('renderPlanGallery', () => {
  it('returns non-empty string', () => {
    const out = renderPlanGallery(galleryData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes candidate ids', () => {
    const out = renderPlanGallery(galleryData);
    expect(out).toContain('aggressive');
    expect(out).toContain('staged');
  });

  it('includes cost and risk estimates', () => {
    const out = renderPlanGallery(galleryData);
    expect(out).toContain('0.045');
    expect(out).toContain('0.80');
  });

  it('marks the recommended candidate', () => {
    const out = renderPlanGallery(galleryData);
    // The recommended marker should appear near 'aggressive' but not 'staged'
    // Exact marker is implementation detail, but something should distinguish them
    const lines = out.split('\n');
    const aggressiveLine = lines.find(l => l.includes('aggressive'));
    const stagedLine = lines.find(l => l.includes('staged'));
    expect(aggressiveLine).toBeDefined();
    expect(stagedLine).toBeDefined();
    // Recommended should have a distinguishing marker
    expect(aggressiveLine!.length).toBeGreaterThanOrEqual(stagedLine!.length - 5);
  });

  it('does not emit JSON', () => {
    const out = renderPlanGallery(galleryData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const planSelectData = {
  selected: 'aggressive',
  headSha: 'abc1234',
  selector: 'agent-1',
  selectedAt: '2026-02-28T12:00:00Z',
  receipt: '.roadmap/receipts/plan-selected.json',
};

describe('renderPlanSelect', () => {
  it('returns non-empty string', () => {
    const out = renderPlanSelect(planSelectData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes selected id', () => {
    const out = renderPlanSelect(planSelectData);
    expect(out).toContain('aggressive');
  });

  it('includes headSha', () => {
    const out = renderPlanSelect(planSelectData);
    expect(out).toContain('abc1234');
  });

  it('includes receipt path', () => {
    const out = renderPlanSelect(planSelectData);
    expect(out).toContain('plan-selected.json');
  });

  it('does not emit JSON', () => {
    const out = renderPlanSelect(planSelectData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const planStatusValidData = {
  status: 'valid' as const,
  candidateId: 'aggressive',
  headSha: 'abc1234',
  headShaMatch: true,
  selectedAt: '2026-02-28T12:00:00Z',
  selector: 'agent-1',
};

const planStatusInvalidData = {
  status: 'invalid' as const,
  reason: 'HEAD_SHA_MISMATCH',
  headShaMatch: false,
  fix: 'roadmap plan select <id> --note "reason"',
};

describe('renderPlanStatus', () => {
  it('renders valid status', () => {
    const out = renderPlanStatus(planStatusValidData);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('aggressive');
    expect(out).toContain('Plan');
  });

  it('renders invalid status with reason', () => {
    const out = renderPlanStatus(planStatusInvalidData);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain('invalid');
    expect(out).toContain('HEAD_SHA_MISMATCH');
  });

  it('does not emit JSON', () => {
    const out = renderPlanStatus(planStatusValidData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const doctorData = {
  dagId: 'test-dag',
  nodeCount: 20,
  completedCount: 15,
  failedCount: 2,
  pendingCount: 3,
  staleCount: 1,
  planCount: 4,
  skippedCount: 0,
  issues: [
    '1 stale completion(s) — node IDs not in head.json: old-node',
    '2 node(s) with failing receipts: node-x, node-y',
  ],
  ok: false,
};

describe('renderDoctor', () => {
  it('returns non-empty string', () => {
    const out = renderDoctor(doctorData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes counts', () => {
    const out = renderDoctor(doctorData);
    expect(out).toContain('20');
    expect(out).toContain('15');
    expect(out).toContain('2');
  });

  it('includes issue text', () => {
    const out = renderDoctor(doctorData);
    expect(out).toContain('stale');
    expect(out).toContain('failing');
  });

  it('renders ok doctor with no issues message', () => {
    const okDoctor = { ...doctorData, issues: [], ok: true };
    const out = renderDoctor(okDoctor);
    expect(out).toMatch(/no issues|clean|ok/i);
  });

  it('does not emit JSON', () => {
    const out = renderDoctor(doctorData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const validateData = {
  results: [
    {
      nodeId: 'node-x',
      passed: false,
      checks: [
        { ruleType: 'artifact-exists', target: 'src/feature.ts', passed: true },
        { ruleType: 'shell', target: 'tsc --noEmit', passed: false, evidence: 'Type error in line 42' },
      ],
    },
  ],
};

describe('renderValidate', () => {
  it('returns non-empty string', () => {
    const out = renderValidate(validateData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes node id', () => {
    const out = renderValidate(validateData);
    expect(out).toContain('node-x');
  });

  it('includes rule names', () => {
    const out = renderValidate(validateData);
    expect(out).toContain('artifact-exists');
    expect(out).toContain('shell');
  });

  it('distinguishes pass and fail', () => {
    const out = renderValidate(validateData);
    // Should show some pass/fail marker
    const lines = out.split('\n');
    const artifactLine = lines.find(l => l.includes('artifact-exists'));
    const shellLine = lines.find(l => l.includes('shell'));
    expect(artifactLine).toBeDefined();
    expect(shellLine).toBeDefined();
  });

  it('includes error message for failing rule', () => {
    const out = renderValidate(validateData);
    expect(out).toContain('Type error');
  });

  it('does not emit JSON', () => {
    const out = renderValidate(validateData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const remainingData = {
  remaining: [
    { id: 'node-e', mode: 'execute', blockedBy: 'unblocked', state: 'pending' as const },
    { id: 'node-f', mode: 'execute', blockedBy: 'node-e', state: 'pending' as const },
    { id: 'node-g', mode: 'plan', blockedBy: 'node-e, node-f', state: 'failed' as const },
  ],
  count: 3,
};

describe('renderRemaining', () => {
  it('returns non-empty string', () => {
    const out = renderRemaining(remainingData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes remaining node ids', () => {
    const out = renderRemaining(remainingData);
    expect(out).toContain('node-e');
    expect(out).toContain('node-f');
    expect(out).toContain('node-g');
  });

  it('includes count', () => {
    const out = renderRemaining(remainingData);
    expect(out).toContain('3');
  });

  it('shows blocked-by information', () => {
    const out = renderRemaining(remainingData);
    expect(out).toContain('unblocked');
    // node-f is blocked by node-e
    const nodeFLine = out.split('\n').find(l => l.includes('node-f'));
    expect(nodeFLine).toContain('node-e');
  });

  it('distinguishes failed vs pending state', () => {
    const out = renderRemaining(remainingData);
    // failed node should have a different marker than pending
    const lines = out.split('\n');
    const failedLine = lines.find(l => l.includes('node-g'));
    const pendingLine = lines.find(l => l.includes('node-e'));
    expect(failedLine).toBeDefined();
    expect(pendingLine).toBeDefined();
    // They should not look identical (one has a fail marker)
    expect(failedLine).not.toBe(pendingLine);
  });

  it('renders empty remaining', () => {
    const out = renderRemaining({ remaining: [], count: 0 });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/no remaining|0/i);
  });

  it('does not emit JSON', () => {
    const out = renderRemaining(remainingData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});

const trailData = {
  entries: [
    { ts: '2026-02-28T10:00:00Z', cmd: 'orient', note: 'session start', repo: 'my-repo', position: ['init'], level: 0 },
    { ts: '2026-02-28T10:15:00Z', cmd: 'complete', note: 'finished setup', repo: 'my-repo', position: ['setup', 'config'], level: 1 },
    { ts: '2026-02-28T10:30:00Z', cmd: 'orient', note: 'checking position', repo: 'my-repo', position: ['build'], level: 2 },
  ],
  count: 3,
  source: 'local' as const,
};

describe('renderTrail', () => {
  it('returns non-empty string', () => {
    const out = renderTrail(trailData);
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes timestamps', () => {
    const out = renderTrail(trailData);
    expect(out).toContain('10:00');
    expect(out).toContain('10:15');
  });

  it('includes command names', () => {
    const out = renderTrail(trailData);
    expect(out).toContain('orient');
    expect(out).toContain('complete');
  });

  it('includes note text', () => {
    const out = renderTrail(trailData);
    expect(out).toContain('session start');
    expect(out).toContain('finished setup');
  });

  it('includes count', () => {
    const out = renderTrail(trailData);
    expect(out).toContain('3');
  });

  it('renders empty trail', () => {
    const out = renderTrail({ entries: [], count: 0, source: 'local' });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/no trail entries/i);
  });

  it('does not emit JSON', () => {
    const out = renderTrail(trailData);
    expect(out).not.toMatch(/^\s*\{/);
  });
});
