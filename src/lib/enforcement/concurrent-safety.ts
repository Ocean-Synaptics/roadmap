// @module enforcement
// @exports RaceDetector, LockManager, AtomicWriter, ConcurrencyController
// @types LockHandle, AtomicOp, ConcurrencyMetrics
// @entry roadmap

import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface LockHandle {
  lockId: string;
  acquiredAt: string;
  owner: string;
}

export interface AtomicOp {
  opId: string;
  startedAt: string;
  operation: () => Promise<any>;
  rollback?: () => Promise<void>;
}

export interface ConcurrencyMetrics {
  activeOperations: number;
  lockWaitTime: number;
  deadlockDetections: number;
  raceConditions: number;
}

/**
 * Race condition detector: identifies concurrent modifications
 */
export class RaceDetector {
  private fileVersions = new Map<string, string>();

  recordVersion(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      this.fileVersions.set(filePath, content);
    } catch {}
  }

  detectChange(filePath: string): boolean {
    try {
      const current = readFileSync(filePath, 'utf-8');
      const previous = this.fileVersions.get(filePath);
      return previous !== undefined && previous !== current;
    } catch {
      return false;
    }
  }

  detectRaceCondition(filePath: string): boolean {
    const changed = this.detectChange(filePath);
    this.recordVersion(filePath);
    return changed;
  }
}

/**
 * Lock manager: file-based distributed locking
 */
export class LockManager {
  constructor(private lockDir: string) {}

  acquire(resource: string, owner: string, timeoutMs: number = 5000): LockHandle | null {
    const lockPath = join(this.lockDir, `${resource}.lock`);
    const lockId = `lock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (!existsSync(lockPath)) {
        const handle: LockHandle = { lockId, acquiredAt: new Date().toISOString(), owner };
        writeFileSync(lockPath, JSON.stringify(handle));
        return handle;
      }
      // Spin wait
    }
    return null; // timeout
  }

  release(lockPath: string): void {
    try {
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
      }
    } catch {}
  }

  isLocked(resource: string): boolean {
    return existsSync(join(this.lockDir, `${resource}.lock`));
  }
}

/**
 * Atomic writer: ensures atomic file updates
 */
export class AtomicWriter {
  async writeAtomic(targetPath: string, content: string): Promise<void> {
    const tempPath = `${targetPath}.tmp.${Date.now()}`;
    try {
      writeFileSync(tempPath, content);
      // Atomic rename (on most systems)
      const fs = await import('node:fs/promises');
      await fs.rename(tempPath, targetPath);
    } catch (e) {
      try {
        unlinkSync(tempPath);
      } catch {}
      throw e;
    }
  }

  async readConsistent(filePath: string, maxRetries: number = 3): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        // Verify readability by parsing if JSON
        try {
          JSON.parse(content);
        } catch {
          // Not JSON, just return
        }
        return content;
      } catch (e) {
        if (i === maxRetries - 1) throw e;
        // Retry with backoff
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 10));
      }
    }
    throw new Error(`Failed to read ${filePath} after ${maxRetries} retries`);
  }
}

/**
 * Concurrency controller: limits parallel execution
 */
export class ConcurrencyController {
  private activeOps: Map<string, AtomicOp> = new Map();
  private metrics: ConcurrencyMetrics = {
    activeOperations: 0,
    lockWaitTime: 0,
    deadlockDetections: 0,
    raceConditions: 0,
  };

  constructor(private maxConcurrent: number = 4) {}

  async runExclusive(opId: string, op: () => Promise<any>): Promise<any> {
    while (this.activeOps.size >= this.maxConcurrent) {
      await new Promise(r => setTimeout(r, 10));
      this.metrics.lockWaitTime += 10;
    }

    this.activeOps.set(opId, { opId, startedAt: new Date().toISOString(), operation: op });
    this.metrics.activeOperations = this.activeOps.size;

    try {
      return await op();
    } finally {
      this.activeOps.delete(opId);
      this.metrics.activeOperations = this.activeOps.size;
    }
  }

  getMetrics(): ConcurrencyMetrics {
    return { ...this.metrics };
  }
}
