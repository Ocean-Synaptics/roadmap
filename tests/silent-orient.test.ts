import { describe, it, expect } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roadmapCli, roadmapCliJson } from './cli-helper.ts';

const trailPath = join(process.cwd(), '.roadmap', 'trail.jsonl');

// Count lines in trail that contain 'orient --check' (which should never appear since --check doesn't record)
function countCheckEntries(): number {
  if (!existsSync(trailPath)) return 0;
  const content = readFileSync(trailPath, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .filter(line => line.includes('dual flags') || line.includes('important context') || line.includes('this note should not be recorded'))
    .length;
}

describe('orient --check (silent polling)', () => {
  it('returns JSON with position field (no --note)', () => {
    const result = roadmapCliJson('orient --check');
    expect(result).toHaveProperty('position');
    expect(Array.isArray(result.position)).toBe(true);
  });

  it('returns valid orientation JSON', () => {
    const result = roadmapCliJson('orient --check');
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('produces');
    expect(result).toHaveProperty('consumes');
    expect(result).toHaveProperty('batchRemaining');
    expect(result).toHaveProperty('batchComplete');
    expect(result).toHaveProperty('done');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('complete');
    expect(typeof result.level).toBe('number');
    expect(Array.isArray(result.produces)).toBe(true);
    expect(Array.isArray(result.consumes)).toBe(true);
  });

  it('does NOT require --note', () => {
    const result = roadmapCliJson('orient --check');
    expect(result).toHaveProperty('position');
    // No error should have been thrown
  });

  it('does NOT append unique entries to trail.jsonl', () => {
    // Count any entries from our test messages that shouldn't exist
    const beforeCount = countCheckEntries();
    roadmapCliJson('orient --check');
    const afterCount = countCheckEntries();
    // No test-specific entries should have been added
    expect(afterCount).toBe(beforeCount);
  });

  it('works with --note (note is ignored for trail)', () => {
    const beforeCount = countCheckEntries();
    const result = roadmapCliJson('orient --check --note "this note should not be recorded"');
    const afterCount = countCheckEntries();

    // Result should still be valid
    expect(result).toHaveProperty('position');
    expect(Array.isArray(result.position)).toBe(true);

    // No test-specific entries should have been added
    expect(afterCount).toBe(beforeCount);
  });

  it('multiple --check calls do not pollute trail', () => {
    const beforeCount = countCheckEntries();

    for (let i = 0; i < 3; i++) {
      roadmapCliJson('orient --check');
    }

    const afterCount = countCheckEntries();
    // No entries should have been added by --check calls
    expect(afterCount).toBe(beforeCount);
  });

  it('orient --check --note works even with both flags', () => {
    const beforeCount = countCheckEntries();
    const result = roadmapCliJson('orient --check --note "dual flags"');
    const afterCount = countCheckEntries();

    expect(result).toHaveProperty('position');
    expect(Array.isArray(result.position)).toBe(true);

    // Verify dual flags note was not recorded
    expect(afterCount).toBe(beforeCount);
  });

  it('help mentions orient --check', () => {
    const output = roadmapCli('help');
    expect(output).toContain('orient --check');
  });
});
