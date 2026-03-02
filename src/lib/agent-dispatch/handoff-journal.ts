// @module agent-dispatch
// @exports HandoffJournal, Checkpoint, FinalHandoff

import * as fs from 'fs';
import * as path from 'path';

export interface Checkpoint {
  nodeId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface FinalHandoff {
  summary: string;
  keyDecisions: string[];
  gotchas: string[];
  timestamp: number;
}

/**
 * Handoff journal: persists checkpoints and final handoffs across agent lifecycle.
 * Enables orchestrator to load checkpoint chain for next agent batch.
 */
export class HandoffJournal {
  private journalRoot = '.dispatch/handoffs';

  constructor() {
    this.ensureJournalDir();
  }

  private ensureJournalDir(): void {
    if (!fs.existsSync(this.journalRoot)) {
      fs.mkdirSync(this.journalRoot, { recursive: true });
    }
  }

  /**
   * Save checkpoint for current node.
   * Overwrites previous checkpoint for same nodeId (not appended).
   */
  saveCheckpoint(nodeId: string, checkpoint: Checkpoint): void {
    const filePath = path.join(this.journalRoot, `${nodeId}.checkpoint.json`);
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
  }

  /**
   * Record final handoff: summary for orchestrator.
   */
  finalHandoff(handoff: FinalHandoff): void {
    const filePath = path.join(this.journalRoot, 'final.handoff.json');
    fs.writeFileSync(filePath, JSON.stringify(handoff, null, 2));
  }

  /**
   * Load checkpoint chain: all checkpoints in sequence.
   * Returns array of checkpoints sorted by timestamp.
   */
  loadChain(): Checkpoint[] {
    if (!fs.existsSync(this.journalRoot)) {
      return [];
    }

    const files = fs.readdirSync(this.journalRoot).filter(f => f.endsWith('.checkpoint.json'));
    const checkpoints: Checkpoint[] = files.map(f => {
      const content = fs.readFileSync(path.join(this.journalRoot, f), 'utf-8');
      return JSON.parse(content) as Checkpoint;
    });

    return checkpoints.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Load final handoff if exists.
   */
  loadFinalHandoff(): FinalHandoff | null {
    const filePath = path.join(this.journalRoot, 'final.handoff.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as FinalHandoff;
  }
}
