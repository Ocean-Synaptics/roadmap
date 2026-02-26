import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import {
  fileExists, gitArtifactAt, siblingArtifactExists, compound, any,
} from '../src/predicates.ts';

const root = process.cwd();
const tmpSibling = join(root, '.test-sibling-repo');

describe('cross-repo predicates', () => {
  describe('siblingArtifactExists', () => {
    it('returns true when artifact exists in sibling working tree', () => {
      mkdirSync(tmpSibling, { recursive: true });
      writeFileSync(join(tmpSibling, 'build.sh'), '#!/bin/sh');
      try {
        const exists = siblingArtifactExists(tmpSibling);
        expect(exists('build.sh')).toBe(true);
      } finally {
        rmSync(tmpSibling, { recursive: true, force: true });
      }
    });

    it('returns false when artifact missing from sibling', () => {
      mkdirSync(tmpSibling, { recursive: true });
      try {
        const exists = siblingArtifactExists(tmpSibling);
        expect(exists('nonexistent.txt')).toBe(false);
      } finally {
        rmSync(tmpSibling, { recursive: true, force: true });
      }
    });

    it('returns false when sibling root does not exist', () => {
      const exists = siblingArtifactExists('/tmp/no-such-repo-xyz');
      expect(exists('anything')).toBe(false);
    });
  });

  describe('gitArtifactAt', () => {
    it('returns true for artifact at HEAD', () => {
      const exists = gitArtifactAt(root, 'HEAD');
      expect(exists('package.json')).toBe(true);
    });

    it('returns false for nonexistent artifact at HEAD', () => {
      const exists = gitArtifactAt(root, 'HEAD');
      expect(exists('no-such-file.xyz')).toBe(false);
    });

    it('returns false for invalid ref', () => {
      const exists = gitArtifactAt(root, 'nonexistent-ref-abc123');
      expect(exists('package.json')).toBe(false);
    });
  });

  describe('any (OR combinator)', () => {
    it('returns true if any predicate matches', () => {
      const never = () => false;
      const always = () => true;
      expect(any(never, always)('x')).toBe(true);
    });

    it('returns false if no predicate matches', () => {
      const never = () => false;
      expect(any(never, never)('x')).toBe(false);
    });

    it('throws with no predicates', () => {
      expect(() => any()).toThrow('at least one predicate');
    });

    it('short-circuits on first true', () => {
      let called = false;
      const first = () => true;
      const second = () => { called = true; return false; };
      any(first, second)('x');
      expect(called).toBe(false);
    });
  });

  describe('compound + any composition', () => {
    it('compound(fileExists, siblingArtifactExists) — both must exist', () => {
      mkdirSync(tmpSibling, { recursive: true });
      writeFileSync(join(tmpSibling, 'package.json'), '{}');
      try {
        const both = compound(fileExists(root), siblingArtifactExists(tmpSibling));
        expect(both('package.json')).toBe(true);
        expect(both('nonexistent.ts')).toBe(false);
      } finally {
        rmSync(tmpSibling, { recursive: true, force: true });
      }
    });

    it('any(fileExists, siblingArtifactExists) — either suffices', () => {
      mkdirSync(tmpSibling, { recursive: true });
      try {
        const either = any(fileExists(root), siblingArtifactExists(tmpSibling));
        // exists locally but not in sibling
        expect(either('package.json')).toBe(true);
        // exists in neither
        expect(either('no-such-file-xyz.ts')).toBe(false);
      } finally {
        rmSync(tmpSibling, { recursive: true, force: true });
      }
    });
  });
});
