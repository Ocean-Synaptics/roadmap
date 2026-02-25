import { describe, it, expect } from 'vitest';
import { fileExists, gitArtifactExists, compound } from '../src/predicates.ts';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

const root = process.cwd();
const tmpDir = join(root, '.test-predicates-tmp');

describe('predicates', () => {
  describe('fileExists', () => {
    it('returns true for existing file', () => {
      const exists = fileExists(root);
      expect(exists('package.json')).toBe(true);
    });

    it('returns false for missing file', () => {
      const exists = fileExists(root);
      expect(exists('nonexistent-file-xyz.ts')).toBe(false);
    });

    it('works with nested paths', () => {
      const exists = fileExists(root);
      expect(exists('src/protocol.ts')).toBe(true);
      expect(exists('src/nonexistent.ts')).toBe(false);
    });
  });

  describe('gitArtifactExists', () => {
    it('returns true for tracked file', () => {
      const exists = gitArtifactExists(root);
      expect(exists('package.json')).toBe(true);
    });

    it('returns false for untracked file', () => {
      // Create an untracked file
      mkdirSync(tmpDir, { recursive: true });
      const tmpFile = join(tmpDir, 'untracked.txt');
      writeFileSync(tmpFile, 'test');
      try {
        const exists = gitArtifactExists(root);
        expect(exists('.test-predicates-tmp/untracked.txt')).toBe(false);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('returns false for nonexistent file', () => {
      const exists = gitArtifactExists(root);
      expect(exists('does-not-exist.xyz')).toBe(false);
    });
  });

  describe('compound', () => {
    it('ANDs multiple predicates', () => {
      const alwaysTrue = () => true;
      const alwaysFalse = () => false;

      expect(compound(alwaysTrue, alwaysTrue)('x')).toBe(true);
      expect(compound(alwaysTrue, alwaysFalse)('x')).toBe(false);
      expect(compound(alwaysFalse, alwaysTrue)('x')).toBe(false);
    });

    it('throws with no predicates', () => {
      expect(() => compound()).toThrow('at least one predicate');
    });

    it('passes artifact name through to all predicates', () => {
      const seen: string[] = [];
      const spy = (a: string) => { seen.push(a); return true; };

      compound(spy, spy)('my-artifact');
      expect(seen).toEqual(['my-artifact', 'my-artifact']);
    });

    it('short-circuits on first false', () => {
      let called = false;
      const first = () => false;
      const second = () => { called = true; return true; };

      compound(first, second)('x');
      expect(called).toBe(false);
    });
  });
});
