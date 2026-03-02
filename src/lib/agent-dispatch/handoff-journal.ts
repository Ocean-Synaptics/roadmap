// @module agent-dispatch
// @exports writeInterimHandoff, writeFinalHandoff, loadJournal, loadFinal, journalDir, saveInterim, saveFinal, JournalEntry

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface JournalEntry {
  timestamp: string;
  progress: number;
  discovered: string[];
  blockers: string[];
  currentFile: string;
}

export interface NextNodeEntry {
  consumes: string[];
  ready: boolean;
  blockers: string[];
}

export function journalDir(repoRoot: string): string {
  return join(repoRoot, '.dispatch', 'handoffs');
}

function ensureJournalDir(repoRoot: string): void {
  const dir = journalDir(repoRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save interim handoff checkpoint during node execution.
 */
export async function writeInterimHandoff(
  repoRoot: string,
  nodeId: string,
  handoff: JournalEntry
): Promise<void> {
  ensureJournalDir(repoRoot);
  const filePath = join(journalDir(repoRoot), `${nodeId}.interim.json`);
  writeFileSync(filePath, JSON.stringify(handoff, null, 2));
}

/**
 * Save final handoff summary at node completion.
 */
export async function writeFinalHandoff(
  repoRoot: string,
  nodeId: string,
  handoff: unknown
): Promise<void> {
  ensureJournalDir(repoRoot);
  const filePath = join(journalDir(repoRoot), 'final.handoff.json');
  writeFileSync(filePath, JSON.stringify(handoff, null, 2));
}

/**
 * Load all interim handoffs (checkpoint chain).
 */
export function loadJournal(repoRoot: string): JournalEntry[] {
  const dir = journalDir(repoRoot);
  if (!existsSync(dir)) {
    return [];
  }

  try {
    const files = readdirSync(dir).filter((f: string) => f.endsWith('.interim.json'));
    return files
      .map((f: string) => {
        const content = readFileSync(join(dir, f), 'utf-8');
        return JSON.parse(content) as JournalEntry;
      })
      .sort((a: JournalEntry, b: JournalEntry) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  } catch {
    return [];
  }
}

/**
 * Load final handoff if it exists.
 */
export function loadFinal(repoRoot: string): Record<string, unknown> | null {
  const filePath = join(journalDir(repoRoot), 'final.handoff.json');
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Aliases for compatibility.
 */
export async function saveInterim(repoRoot: string, nodeId: string, data: JournalEntry): Promise<void> {
  return writeInterimHandoff(repoRoot, nodeId, data);
}

export async function saveFinal(repoRoot: string, nodeId: string, data: unknown): Promise<void> {
  return writeFinalHandoff(repoRoot, nodeId, data);
}
