// @module receipt-first/cmd-receipt
// @exports CmdReceipt, CmdReceiptWriter
// @entry roadmap/receipt-first

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export interface CmdReceipt {
  schema_version: 1;
  type: 'cmd-receipt';
  cmd: string;
  runId: string;
  repoRoot: string;
  headSha: string;
  treeSha?: string;
  startedAt: string;
  endedAt: string;
  ok: boolean;
  exitCode: number;
  dataSha256: string;
  evidence: {
    argv: string[];
    stdout_sha256: string;
    stderr_sha256: string;
    artifacts_read: string[];
    artifacts_written: string[];
  };
  scenario?: string;
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function getTreeSha(): string | undefined {
  try {
    return execSync('git write-tree', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return undefined;
  }
}

function getHeadSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return 'unknown';
  }
}

export class CmdReceiptWriter {
  private repoRoot: string;
  private startedAt: string;

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot ?? process.cwd();
    this.startedAt = new Date().toISOString();
  }

  write(opts: {
    cmd: string;
    runId: string;
    ok: boolean;
    exitCode: number;
    data?: unknown;
    argv: string[];
    stdout?: string;
    stderr?: string;
    artifacts_read?: string[];
    artifacts_written?: string[];
    scenario?: string;
  }): CmdReceipt {
    const dir = join(this.repoRoot, '.roadmap', 'receipts', 'cmd', opts.cmd);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const dataStr = opts.data !== undefined ? JSON.stringify(opts.data) : '';

    const receipt: CmdReceipt = {
      schema_version: 1,
      type: 'cmd-receipt',
      cmd: opts.cmd,
      runId: opts.runId,
      repoRoot: this.repoRoot,
      headSha: getHeadSha(),
      treeSha: getTreeSha(),
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      ok: opts.ok,
      exitCode: opts.exitCode,
      dataSha256: sha256(dataStr),
      evidence: {
        argv: opts.argv,
        stdout_sha256: sha256(opts.stdout ?? ''),
        stderr_sha256: sha256(opts.stderr ?? ''),
        artifacts_read: opts.artifacts_read ?? [],
        artifacts_written: opts.artifacts_written ?? [],
      },
    };

    if (opts.scenario) receipt.scenario = opts.scenario;

    const path = join(dir, `${opts.runId}.json`);
    writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');

    return receipt;
  }

  receiptPath(cmd: string, runId: string): string {
    return join(this.repoRoot, '.roadmap', 'receipts', 'cmd', cmd, `${runId}.json`);
  }
}
