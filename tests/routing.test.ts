#!/usr/bin/env node
// @module test
// @test Core routing dispatch for 6 mainline commands + 4 group handlers

import { execSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();

// Test utilities
function runCmd(cmd: string): string {
  try {
    return execSync(`npx ts-node bin/roadmap.ts ${cmd}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    // Return combined output for error testing
    if (e instanceof Error) {
      // Try to get stdout from the error
      const stdout = (e as any).stdout ? (e as any).stdout.toString().trim() : '';
      const stderr = (e as any).stderr ? (e as any).stderr.toString().trim() : '';
      return stdout || stderr || e.message;
    }
    throw new Error(`Command failed: ${cmd}\n${String(e)}`);
  }
}

// Parse JSON output
function parseJSON(output: string): unknown {
  const lines = output.split('\n');
  // Find the first { and extract from there
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('{')) {
      return JSON.parse(lines.slice(i).join('\n'));
    }
  }
  throw new Error(`No JSON found in output: ${output}`);
}

// Core test suite
const tests: Array<{ name: string; run: () => void }> = [
  {
    name: 'Core command: orient routes correctly',
    run: () => {
      const output = runCmd('orient --note "test"');
      const result = parseJSON(output);
      if (typeof result !== 'object' || result === null) throw new Error('Invalid result');
      const obj = result as any;
      if (!obj.data || typeof obj.data !== 'object') {
        throw new Error('Missing data field in orient response');
      }
      if (!Array.isArray(obj.data.position)) {
        throw new Error('Missing position array in orient response');
      }
    },
  },
  {
    name: 'Core command: chart routes correctly',
    run: () => {
      const output = runCmd('chart');
      const result = parseJSON(output);
      if (typeof result !== 'object' || result === null) throw new Error('Invalid result');
      const obj = result as any;
      if (!obj.data || typeof obj.data !== 'object') {
        throw new Error('Missing data field in chart response');
      }
      if (typeof obj.data.dagId !== 'string') {
        throw new Error('Missing dagId in chart response');
      }
    },
  },
  {
    name: 'Core command: show routes correctly',
    run: () => {
      const output = runCmd('show refactor-core-routing');
      const result = parseJSON(output);
      if (typeof result !== 'object' || result === null) throw new Error('Invalid result');
      const obj = result as any;
      if (!obj.data || typeof obj.data !== 'object') {
        throw new Error('Missing data field in show response');
      }
      if (typeof obj.data.id !== 'string') {
        throw new Error('Missing id in show response');
      }
    },
  },
  {
    name: 'Group command: dag help',
    run: () => {
      const output = runCmd('dag help');
      if (!output.includes('Subcommands:')) {
        throw new Error('dag help missing subcommands');
      }
      if (!output.includes('diff') || !output.includes('expand')) {
        throw new Error('dag help missing expected subcommands');
      }
    },
  },
  {
    name: 'Group command: team help',
    run: () => {
      const output = runCmd('team help');
      if (!output.includes('Subcommands:')) {
        throw new Error('team help missing subcommands');
      }
      if (!output.includes('claim') || !output.includes('dispatch')) {
        throw new Error('team help missing expected subcommands');
      }
    },
  },
  {
    name: 'Group command: spec help',
    run: () => {
      const output = runCmd('spec help');
      if (!output.includes('Subcommands:')) {
        throw new Error('spec help missing subcommands');
      }
      if (!output.includes('plan') || !output.includes('import')) {
        throw new Error('spec help missing expected subcommands');
      }
    },
  },
  {
    name: 'Group command: util help',
    run: () => {
      const output = runCmd('util help');
      if (!output.includes('Subcommands:')) {
        throw new Error('util help missing subcommands');
      }
      if (!output.includes('trail') || !output.includes('checkpoint')) {
        throw new Error('util help missing expected subcommands');
      }
    },
  },
  {
    name: 'Main help command',
    run: () => {
      const output = runCmd('help');
      if (!output.includes('Core commands')) {
        throw new Error('help missing core commands section');
      }
      if (!output.includes('Command groups')) {
        throw new Error('help missing groups section');
      }
      if (!output.includes('orient') || !output.includes('chart')) {
        throw new Error('help missing core commands');
      }
      if (!output.includes('dag') || !output.includes('team')) {
        throw new Error('help missing group names');
      }
    },
  },
  {
    name: 'Unknown command error',
    run: () => {
      const output = runCmd('nonexistent');
      if (!output.includes('Unknown command') && !output.includes('error')) {
        throw new Error(`Expected "Unknown command" error in output, got: ${output}`);
      }
    },
  },
];

// Run tests
async function runTests() {
  console.log(`Running ${tests.length} routing tests...\n`);
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test.run();
      console.log(`✓ ${test.name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${test.name}`);
      console.error(`  Error: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${tests.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
