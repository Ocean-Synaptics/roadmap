// Command-level instrumentation for metaflow mining
// Wraps CLI commands to capture execution metrics, exit codes, output structure

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CommandExecution {
  cmd: string;
  args: string[];
  startTime: number;
  endTime: number;
  exitCode: number;
  outputSize: number;
  outputStructure: 'json' | 'text' | 'mixed';
  errors?: string[];
  timestamp: string;
}

export class CommandInstrument {
  private runDir: string;
  private executions: CommandExecution[] = [];

  constructor(runId: string, repoRoot: string) {
    this.runDir = join(repoRoot, '.roadmap', 'runs', runId);
    mkdirSync(this.runDir, { recursive: true });
  }

  recordExecution(cmd: string, args: string[], exitCode: number, output: string): CommandExecution {
    const startTime = Date.now();
    const execution: CommandExecution = {
      cmd,
      args,
      startTime,
      endTime: startTime,
      exitCode,
      outputSize: output.length,
      outputStructure: this.classifyOutput(output),
      timestamp: new Date().toISOString(),
    };
    this.executions.push(execution);
    return execution;
  }

  private classifyOutput(output: string): 'json' | 'text' | 'mixed' {
    const hasJson = /^\s*[\{\[]/.test(output);
    const hasText = /^[^{\[]|[^}\]]\s*$/.test(output);
    if (hasJson && !hasText) return 'json';
    if (hasText && !hasJson) return 'text';
    return 'mixed';
  }

  saveMining() {
    writeFileSync(
      join(this.runDir, 'mining.json'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        commands: this.executions.length,
        executions: this.executions,
      }, null, 2)
    );
  }
}
