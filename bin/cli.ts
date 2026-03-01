#!/usr/bin/env node

// @module cli
// @exports (CLI binary — no programmatic exports)
// @entry bin/cli

import { registry } from '../src/cli/registry.ts';

// --- Built-in help command ---

function printHelp(): void {
  const lines = ['Usage: roadmap-cli <command> [args...]', '', 'Commands:'];
  for (const [name, def] of Array.from(registry.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const usage = def.usage ? `  ${def.usage}` : '';
    lines.push(`  ${name.padEnd(16)} ${def.description}${usage}`);
  }
  lines.push('', '  help             Show this help message');
  console.log(lines.join('\n'));
}

// --- Dispatch ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  const def = registry.get(cmd);
  if (!def) {
    console.error(`Unknown command: ${cmd}`);
    console.error(`Run with --help to see available commands.`);
    process.exitCode = 1;
    return;
  }

  await def.handler(args.slice(1));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
