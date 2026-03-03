import { describe, it, expect, beforeEach } from 'vitest';
import { createGitSafeLoader } from '../src/lib/gitsafe-loader';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), 'gitsafe-test-' + Math.random().toString(36).slice(2));
  mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  const enforcement = {
    version: "1.0",
    denylist: ["node_modules/**", ".env"],
    maxBytes: 1024,
    auditTrail: true,
    allowedFilePatterns: ["src/**"]
  };
  writeFileSync(join(tmpDir, '.roadmap', 'enforcement.json'), JSON.stringify(enforcement));
  mkdirSync(join(tmpDir, 'src'), { recursive: true });
  writeFileSync(join(tmpDir, 'src', 'test.ts'), 'export const x = 1;');
});

describe('GitSafeLoader', () => {
  it('loads allowed files', () => {
    const loader = createGitSafeLoader(tmpDir);
    expect(loader.isAllowed('src/test.ts')).toBe(true);
  });

  it('denies denylist paths', () => {
    const loader = createGitSafeLoader(tmpDir);
    expect(loader.isAllowed('node_modules/pkg')).toBe(false);
  });

  it('returns denylist', () => {
    const loader = createGitSafeLoader(tmpDir);
    expect(loader.getDenylist().length).toBeGreaterThan(0);
  });
});
