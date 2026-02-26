/**
 * Tests for migrate-memory.sh
 * - idempotency (safe to run multiple times)
 * - platform detection (Mac + Linux)
 * - symlink creation
 * - git repo initialization
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const tmpDir = join(tmpdir(), `migrate-memory-test-${Date.now()}`);
const scriptPath = '/home/griffin/src/roadmap/bin/migrate-memory.sh';

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  initTestRepo(tmpDir);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function initTestRepo(path: string) {
  execSync('git init', { cwd: path });
  execSync('git config user.email "test@test.com"', { cwd: path });
  execSync('git config user.name "Test User"', { cwd: path });
  writeFileSync(join(path, 'README.md'), '# Test');
  execSync('git add .', { cwd: path });
  execSync('git commit -m "init"', { cwd: path });
}

function runMigrationScript(repoPath: string): string {
  const result = execSync(`bash ${scriptPath} ${repoPath}`, {
    encoding: 'utf-8',
  });
  return result;
}

function isSymlink(path: string): boolean {
  try {
    const stat = execSync(`[ -L "${path}" ] && echo yes || echo no`, {
      encoding: 'utf-8',
      shell: '/bin/bash',
    }).trim();
    return stat === 'yes';
  } catch {
    return false;
  }
}

function symlinkTarget(path: string): string | null {
  try {
    return execSync(`readlink "${path}"`, {
      encoding: 'utf-8',
      shell: '/bin/bash',
    }).trim();
  } catch {
    return null;
  }
}

describe('migrate-memory.sh', () => {
  describe('platform detection', () => {
    it('runs on Linux', () => {
      const os = execSync('uname -s', { encoding: 'utf-8' }).trim();
      expect(['Linux', 'Darwin']).toContain(os);
    });

    it('detects platform correctly', () => {
      const output = runMigrationScript(tmpDir);
      expect(output).toContain('Platform: ');
    });
  });

  describe('local memory directory', () => {
    it('creates .roadmap/memory directory', () => {
      const memoryDir = join(tmpDir, '.roadmap', 'memory');
      runMigrationScript(tmpDir);

      const stat = execSync(`test -d "${memoryDir}" && echo yes || echo no`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();
      expect(stat).toBe('yes');
    });

    it('is idempotent for local memory dir', () => {
      const memoryDir = join(tmpDir, '.roadmap', 'memory');
      const output1 = runMigrationScript(tmpDir);
      const output2 = runMigrationScript(tmpDir);

      expect(output1).toMatch(/Creating|already exists/);
      expect(output2).toContain('already exists');
    });
  });

  describe('MEMORY.md symlink', () => {
    it('creates symlink to /dev/null', () => {
      runMigrationScript(tmpDir);
      const memoryFile = join(tmpDir, 'MEMORY.md');

      expect(isSymlink(memoryFile)).toBe(true);
      expect(symlinkTarget(memoryFile)).toBe('/dev/null');
    });

    it('is idempotent for MEMORY.md symlink', () => {
      runMigrationScript(tmpDir);
      const memoryFile = join(tmpDir, 'MEMORY.md');

      const beforeTarget = symlinkTarget(memoryFile);
      runMigrationScript(tmpDir);
      const afterTarget = symlinkTarget(memoryFile);

      expect(beforeTarget).toBe(afterTarget);
      expect(afterTarget).toBe('/dev/null');
    });

    it('preserves existing /dev/null symlink', () => {
      const memoryFile = join(tmpDir, 'MEMORY.md');

      // Create first time
      runMigrationScript(tmpDir);
      expect(symlinkTarget(memoryFile)).toBe('/dev/null');

      // Run again
      const output = runMigrationScript(tmpDir);
      expect(symlinkTarget(memoryFile)).toBe('/dev/null');
      expect(output).toContain('already symlinked');
    });
  });

  describe('global memory repo', () => {
    it('initializes ~/.roadmap/memory as git repo', () => {
      runMigrationScript(tmpDir);
      const globalMemory = join(process.env.HOME || '', '.roadmap', 'memory');

      const isRepo = execSync(`test -d "${globalMemory}/.git" && echo yes || echo no`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();
      expect(isRepo).toBe('yes');
    });

    it('is idempotent for global repo', () => {
      runMigrationScript(tmpDir);
      const globalMemory = join(process.env.HOME || '', '.roadmap', 'memory');

      const output1 = runMigrationScript(tmpDir);
      const output2 = runMigrationScript(tmpDir);

      const isRepo = execSync(`test -d "${globalMemory}/.git" && echo yes || echo no`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();
      expect(isRepo).toBe('yes');
      expect(output2).toContain('already initialized');
    });

    it('creates .gitignore in global repo', () => {
      runMigrationScript(tmpDir);
      const globalMemory = join(process.env.HOME || '', '.roadmap', 'memory');
      const gitignore = join(globalMemory, '.gitignore');

      const exists = execSync(`test -f "${gitignore}" && echo yes || echo no`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();
      expect(exists).toBe('yes');

      const content = readFileSync(gitignore, 'utf-8');
      expect(content).toContain('node_modules');
      expect(content).toContain('.env');
    });

    it('creates README in global repo', () => {
      runMigrationScript(tmpDir);
      const globalMemory = join(process.env.HOME || '', '.roadmap', 'memory');
      const readme = join(globalMemory, 'README.md');

      const exists = execSync(`test -f "${readme}" && echo yes || echo no`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      }).trim();
      expect(exists).toBe('yes');

      const content = readFileSync(readme, 'utf-8');
      expect(content).toContain('Global Memory');
    });
  });

  describe('full workflow', () => {
    it('completes migration in one run', () => {
      const output = runMigrationScript(tmpDir);

      expect(output).toContain('Migration complete');
      expect(output).toContain('Summary');
      expect(output).toContain('✅');
    });

    it('is safe to run multiple times', () => {
      const outputs = [];
      for (let i = 0; i < 3; i++) {
        const output = runMigrationScript(tmpDir);
        outputs.push(output);
        expect(output).not.toContain('error');
        expect(output).not.toContain('Error');
      }

      // All runs should succeed
      expect(outputs.length).toBe(3);
      expect(outputs.every(o => o.includes('✅'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles nonexistent repo gracefully', () => {
      const nonexistentPath = join(tmpDir, 'nonexistent-repo');
      const output = execSync(`bash ${scriptPath} ${nonexistentPath} 2>&1 || true`, {
        encoding: 'utf-8',
      });

      // Should still try to create memory dirs
      expect(output).toContain('memory');
    });
  });

  describe('output format', () => {
    it('provides clear progress indicators', () => {
      const output = runMigrationScript(tmpDir);

      expect(output).toContain('ℹ️');  // info
      expect(output).toContain('✅');  // success
    });

    it('includes next steps guidance', () => {
      const output = runMigrationScript(tmpDir);

      expect(output).toContain('Next steps');
      expect(output).toContain('git');
      expect(output).toContain('status');
    });
  });
});
