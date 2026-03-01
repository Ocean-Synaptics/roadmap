// Unified CLI command registry
// Consolidates all command registrations in one place

import { program } from 'commander';
import { registerAuditCommand } from './commands/audit';
import { registerExpandCommand } from './commands/expand';

export function initializeCliRegistry() {
  program
    .name('roadmap')
    .description('DAG expansion protocol CLI')
    .version('0.7.0');

  // Register all commands
  registerAuditCommand();
  registerExpandCommand();

  // Help + discovery
  program.helpOption('-h, --help', 'Show help');
  program.addHelpCommand('help [cmd]', 'Show help for command');

  return program;
}

export { program };
