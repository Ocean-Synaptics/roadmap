// Repair history log — audit trail for all repair operations

import fs from 'fs';
import path from 'path';

export interface RepairLogEntry {
  timestamp: number;
  operationId: string;
  type: string;
  target: string;
  success: boolean;
  approver: string;
  rollbackInfo?: {
    appliedAt?: number;
    reversible: boolean;
    method: string;
  };
  error?: string;
  metadata?: Record<string, unknown>;
}

export class RepairHistoryLog {
  private logPath: string;
  private entries: RepairLogEntry[] = [];

  constructor(roadmapRoot: string) {
    this.logPath = path.join(roadmapRoot, '.roadmap/repairs/history.jsonl');
    this.ensureLogFile();
  }

  private ensureLogFile(): void {
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.logPath)) {
      fs.writeFileSync(this.logPath, '');
    }
  }

  record(entry: RepairLogEntry): void {
    this.entries.push(entry);
    const line = JSON.stringify(entry);
    fs.appendFileSync(this.logPath, line + '\n');
  }

  load(): RepairLogEntry[] {
    if (!fs.existsSync(this.logPath)) return [];

    const lines = fs.readFileSync(this.logPath, 'utf8').trim().split('\n').filter(l => l);
    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error(`Failed to parse history line: ${line}`);
        return null;
      }
    }).filter(Boolean) as RepairLogEntry[];
  }

  getByOperationId(operationId: string): RepairLogEntry | undefined {
    return this.entries.find(e => e.operationId === operationId);
  }

  getSuccessful(): RepairLogEntry[] {
    return this.entries.filter(e => e.success);
  }

  getFailed(): RepairLogEntry[] {
    return this.entries.filter(e => !e.success);
  }

  getRecent(limit: number = 10): RepairLogEntry[] {
    return this.entries.slice(-limit);
  }

  summary(): {
    total: number;
    successful: number;
    failed: number;
    lastRepair?: RepairLogEntry;
  } {
    return {
      total: this.entries.length,
      successful: this.getSuccessful().length,
      failed: this.getFailed().length,
      lastRepair: this.entries[this.entries.length - 1],
    };
  }
}

export function createRepairLog(roadmapRoot: string): RepairHistoryLog {
  return new RepairHistoryLog(roadmapRoot);
}
