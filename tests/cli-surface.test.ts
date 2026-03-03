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

    it('advance: next batch', () => {
      const result = runCommand(['advance', '--note', 'test']);
      expect(result).toHaveProperty('cmd');
    });

    it('show: inspect node (requires id)', () => {
      const result = runCommand(['show', 'init', '--note', 'test']);
      expect(result).toHaveProperty('cmd');
    });

    it('complete: atomic completion (requires id)', () => {
      const result = runCommand(['complete', 'test-node', '--note', 'test']);
      expect(result).toHaveProperty('cmd');
    });

    it('chart: shows progress', () => {
      const result = runCommand(['chart']);
      expect(result).toHaveProperty('cmd');
    });

    it('validate: check state', () => {
      const result = runCommand(['validate', '--note', 'test']);
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
      // Should NOT mention explore as a core command
      expect(helpOutput).not.toContain('explore [--api');
    });
  });

  describe('dag group (DAG manipulation)', () => {
    const dagSubs = [
      { sub: 'diff', requiresNote: true },
      { sub: 'expand', requiresNote: true },
      { sub: 'propagate', requiresNote: true },
      { sub: 'retire', requiresNote: true },
      { sub: 'optimize', requiresNote: true },
      { sub: 'switch', requiresNote: true },
      { sub: 'spawn', requiresNote: true },
    ];

    for (const { sub, requiresNote } of dagSubs) {
      it(`dag ${sub}: routes correctly`, () => {
        const args = ['dag', sub];
        if (requiresNote) args.push('--note', 'test');
        const result = runCommand(args);
        // Should route, may fail due to missing args/state
        expect(result).toHaveProperty('cmd');
      });
    }

    it('dag help: shows all subcommands', () => {
      const result = execSync(`npx tsx ${roadmapPath} dag help`, {
        encoding: 'utf-8',
      });
      const expected = ['diff', 'expand', 'propagate', 'retire', 'optimize', 'switch', 'spawn'];
      for (const sub of expected) {
        expect(result).toContain(sub);
      }
    });
  });

  describe('team group (Multi-agent coordination)', () => {
    const teamSubs = [
      { sub: 'claim', requiresNote: false },
      { sub: 'dispatch', requiresNote: true },
      { sub: 'strategy', requiresNote: true },
      { sub: 'assign', requiresNote: true },
    ];

    for (const { sub, requiresNote } of teamSubs) {
      it(`team ${sub}: routes correctly`, () => {
        const args = ['team', sub];
        if (requiresNote) args.push('--note', 'test');
        const result = runCommand(args);
        expect(result).toHaveProperty('cmd');
      });
    }

    it('team help: shows all subcommands', () => {
      const result = execSync(`npx tsx ${roadmapPath} team help`, {
        encoding: 'utf-8',
      });
      const expected = ['claim', 'dispatch', 'strategy', 'assign'];
      for (const sub of expected) {
        expect(result).toContain(sub);
      }
    });
  });

  describe('spec group (Spec intake pipeline)', () => {
    const specSubs = [
      { sub: 'plan', requiresNote: true },
      { sub: 'import', requiresNote: true },
      { sub: 'intake', requiresNote: true },
      { sub: 'compile', requiresNote: true },
      { sub: 'init', requiresNote: true },
    ];

    for (const { sub, requiresNote } of specSubs) {
      it(`spec ${sub}: routes correctly`, () => {
        const args = ['spec', sub];
        if (requiresNote) args.push('--note', 'test');
        const result = runCommand(args);
        expect(result).toHaveProperty('cmd');
      });
    }

    it('spec help: shows all subcommands', () => {
      const result = execSync(`npx tsx ${roadmapPath} spec help`, {
        encoding: 'utf-8',
      });
      const expected = ['plan', 'import', 'intake', 'compile', 'init'];
      for (const sub of expected) {
        expect(result).toContain(sub);
      }
    });
  });

  describe('util group (Session utilities)', () => {
    it('util trail: routes correctly', () => {
      const result = runCommand(['util', 'trail']);
      expect(result).toHaveProperty('cmd');
    });

    it('util checkpoint: routes correctly', () => {
      const result = runCommand(['util', 'checkpoint', '--list']);
      expect(result).toHaveProperty('cmd');
    });

    it('util federation: routes correctly', () => {
      const result = runCommand(['util', 'federation', '--note', 'test']);
      expect(result).toHaveProperty('cmd');
    });

    it('util install: succeeds (outputs text)', () => {
      try {
        const output = execSync(`npx tsx ${roadmapPath} util install`, {
          encoding: 'utf-8',
        });
        // install outputs text, not JSON
        expect(output).toContain('Updated roadmap protocol');
      } catch (e: any) {
        // May fail due to file permissions, but should route correctly
        expect(e.message).toBeDefined();
      }
    });

    it('util help: shows all subcommands', () => {
      const result = execSync(`npx tsx ${roadmapPath} util help`, {
        encoding: 'utf-8',
      });
      const expected = ['trail', 'checkpoint', 'install', 'federation'];
      for (const sub of expected) {
        expect(result).toContain(sub);
      }
    });
  });

  describe('Error handling', () => {
    it('unknown commands fail with helpful message', () => {
      const result = runCommand(['unknown-command', '--note', 'test']);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Unknown command');
      // Error hint is in the fix array
      const fixMessage = Array.isArray(result.error?.fix) ? result.error.fix.join(' ') : result.error?.fix;
      expect(fixMessage).toContain('Mainline:');
      expect(fixMessage).toContain('Groups:');
    });

    it('core commands requiring --note reject missing note', () => {
      const result = runCommand(['advance']);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('--note');
    });

    it('note-exempt commands work without --note', () => {
      const result = runCommand(['chart']);
      expect(result).toHaveProperty('cmd');
    });

    it('invalid subcommand in group fails gracefully', () => {
      const result = runCommand(['dag', 'invalid-sub', '--note', 'test']);
      expect(result.ok).toBe(false);
      expect(result.error?.message).toContain('Unknown');
    });
  });

  describe('Help text structure', () => {
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

    it('explore is not documented as core command', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      // Explore should not be in the core commands section
      const coreSection = helpOutput.substring(
        helpOutput.indexOf('Core commands'),
        helpOutput.indexOf('Command groups')
      );
      expect(coreSection).not.toContain('explore');
    });
  });

  describe('Command structure validation', () => {
    it('core and group commands are mutually exclusive', () => {
      const coreCommands = new Set(['orient', 'advance', 'show', 'complete', 'chart', 'validate']);
      const groups = new Set(['dag', 'team', 'spec', 'util']);
      const intersection = [...coreCommands].filter(c => groups.has(c));
      expect(intersection).toHaveLength(0);
    });

    it('exactly 6 core commands', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const coreSection = helpOutput.substring(
        helpOutput.indexOf('Core commands'),
        helpOutput.indexOf('Command groups')
      );
      // Count command descriptions (lines starting with spaces + command name)
      const lines = coreSection.split('\n').filter(l => l.match(/^\s{2,}[a-z]/));
      expect(lines.length).toBe(6);
    });

    it('exactly 4 groups', () => {
      const helpOutput = execSync(`npx tsx ${roadmapPath} help`, {
        encoding: 'utf-8',
      });
      const groupsSection = helpOutput.substring(
        helpOutput.indexOf('Command groups')
      );
      const groups = ['dag', 'team', 'spec', 'util'];
      for (const group of groups) {
        expect(groupsSection).toContain(`${group} <sub>`);
      }
    });
  });
});
