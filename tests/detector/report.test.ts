import { describe, it, expect } from 'vitest';
import { DisconnectAggregator, generateDisconnectReport } from '../../src/lib/disconnect-detector/aggregator';

describe('DisconnectAggregator', () => {
  it('aggregates findings from all subsystems', async () => {
    const aggregator = new DisconnectAggregator({ roadmapRoot: process.cwd() });
    const report = await aggregator.analyze();

    expect(report).toBeDefined();
    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.findings).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.severity).toMatch(/critical|high|medium|low/);
  });

  it('includes findings from all 6 subsystems', async () => {
    const aggregator = new DisconnectAggregator({ roadmapRoot: process.cwd() });
    const report = await aggregator.analyze();

    expect(report.findings.dag).toBeDefined();
    expect(report.findings.files).toBeDefined();
    expect(report.findings.imports).toBeDefined();
    expect(report.findings.completion).toBeDefined();
    expect(report.findings.validation).toBeDefined();
    expect(report.findings.intent).toBeDefined();
  });

  it('generates actionable recommendations', async () => {
    const aggregator = new DisconnectAggregator({ roadmapRoot: process.cwd() });
    const report = await aggregator.analyze();

    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('exposes generateDisconnectReport function', async () => {
    const report = await generateDisconnectReport({ roadmapRoot: process.cwd() });

    expect(report).toBeDefined();
    expect(report.timestamp).toBeGreaterThan(0);
  });
});
