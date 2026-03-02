// CLI command: roadmap expand
// Wraps expansion script execution behind canonical CLI interface

import type { Command } from 'commander';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function registerExpandCommand(program: Command) {
  program
    .command('expand <script>')
    .description('Run expansion script to refine DAG')
    .option('--type <type>', 'Script type: structural or iteration')
    .action(async (scriptPath: string, opts: { type?: string }) => {
      const fullPath = path.resolve(scriptPath);
      if (!fs.existsSync(fullPath)) {
        console.error(`Script not found: ${fullPath}`);
        process.exit(1);
      }
      try {
        const result = execSync(`npx tsx ${fullPath}`, { encoding: 'utf-8' });
        console.log(result);
      } catch (e: unknown) {
        console.error('Expansion failed:', (e as Error).message);
        process.exit(1);
      }
    });
}

export { registerExpandCommand as default };
