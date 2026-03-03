import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const roadmapPath = join(process.cwd(), 'bin/roadmap.ts');

function runCommand(args: string[]): { ok: boolean; error?: unknown } {
  try {
    const result = execSync(`npx tsx ${roadmapPath} ${args.join(' ')}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    const parsed = JSON.parse(result);
    return parsed;
  } catch (e: any) {
    if (e.stdout) {
      try {
        const parsed = JSON.parse(e.stdout);
        return parsed;
      } catch {
        return { ok: false, error: e.stdout };
      }
    }
    return { ok: false, error: e.message };
  }
}

describe('CLI Surface Consolidation', () => {
  describe('Core commands (6 mainline)', () => {
    it('orient: reports current batch position', () => {
      const result = runCommand(['orient', '--note', 'test']);
      // Will fail without DAG, but should route correctly
      expect(result).toHaveProperty('cmd');
    });

    it('chart: shows progress', () => {
      const result = runCommand(['chart']);
      expect(result).toHaveProperty('cmd');
    });

    it('help: shows consolidated surface', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      expect(helpOutput).toContain('Core commands');
      expect(helpOutput).toContain('Command groups');
      expect(helpOutput).toContain('dag');
      expect(helpOutput).toContain('team');
      expect(helpOutput).toContain('spec');
      expect(helpOutput).toContain('util');
      // Should NOT mention --json (JSON is default, no flag)
      expect(helpOutput).not.toContain('--json');
      expect(helpOutput).not.toContain('--human');
    });
  });

  describe('Group commands (dag, team, spec, util)', () => {
    it('dag: routes to sub-commands', () => {
      const result = runCommand(['dag', 'diff', '--note', 'test']);
      // Will fail due to no candidate, but should route to dag.diff
      expect(result.cmd).toContain('dag');
    });

    it('team: routes to sub-commands', () => {
      const result = runCommand(['team', 'claim', '--note', 'test']);
      // Will fail, but should route to team subcommand
      expect(result).toHaveProperty('cmd');
    });

    it('spec: routes to sub-commands', () => {
      const result = runCommand(['spec', 'plan', '--note', 'test']);
      // Will fail, but should route correctly
      expect(result).toHaveProperty('cmd');
    });

    it('util: routes to sub-commands', () => {
      const result = runCommand(['util', 'trail']);
      // Trail is note-exempt
      expect(result).toHaveProperty('cmd');
    });
  });

  describe('Fail-fast behavior', () => {
    it('unknown commands fail immediately', () => {
      const result = runCommand(['unknown-command', '--note', 'test']);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Unknown command');
    });
  });

  describe('Help text sanity', () => {
    it('help output is concise (<50 lines)', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const lines = helpOutput.trim().split('\n');
      expect(lines.length).toBeLessThan(50);
    });

    it('core commands are listed first', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const corePos = helpOutput.indexOf('Core commands');
      const groupsPos = helpOutput.indexOf('Command groups');
      expect(corePos).toBeGreaterThan(-1);
      expect(groupsPos).toBeGreaterThan(-1);
      expect(corePos).toBeLessThan(groupsPos);
    });

    it('all 6 core commands documented', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const coreCommands = ['orient', 'advance', 'show', 'complete', 'chart', 'validate'];
      for (const cmd of coreCommands) {
        expect(helpOutput).toContain(cmd);
      }
    });

    it('all 4 groups documented', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const groups = ['dag', 'team', 'spec', 'util'];
      for (const group of groups) {
        expect(helpOutput).toContain(`  ${group} <sub>`);
      }
    });
  });
});
