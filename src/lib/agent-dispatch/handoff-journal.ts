// @module handoff-journal
// @exports writeInterimHandoff, writeFinalHandoff, loadHandoffChain
// @types JournalEntry
// @entry roadmap/agent

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { InterimHandoff, FinalHandoff } from '../brief.ts';

export type JournalEntry = InterimHandoff | FinalHandoff;

/**
 * Write an interim checkpoint.
 * Signature: (repoRoot, nodeId, entry) — auto-resolves .dispatch/{nodeId}/
 * Returns the sequence number assigned.
 */
export async function writeInterimHandoff(
  repoRoot: string,
  nodeId: string,
  entry: InterimHandoff,
): Promise<number> {
  const dir = join(repoRoot, '.dispatch', nodeId);
  await mkdir(dir, { recursive: true });

  const existing = await readdir(dir).catch(() => []);
  const interims = existing.filter(f => f.startsWith('interim-') && f.endsWith('.json'));
  const seq = interims.length;

  const path = join(dir, `interim-${String(seq).padStart(3, '0')}.json`);
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
  return seq;
}

/**
 * Write a final handoff. Overwrites any previous final.
 * Signature: (repoRoot, nodeId, entry)
 */
export async function writeFinalHandoff(
  repoRoot: string,
  nodeId: string,
  entry: FinalHandoff,
): Promise<void> {
  const dir = join(repoRoot, '.dispatch', nodeId);
  await mkdir(dir, { recursive: true });

  const path = join(dir, 'handoff.json');
  await writeFile(path, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
}

/**
 * Load the full handoff chain for a node: all interims in order, then final if present.
 * Signature: (repoRoot, nodeId)
 */
export async function loadHandoffChain(
  repoRoot: string,
  nodeId: string,
): Promise<JournalEntry[]> {
  const dir = join(repoRoot, '.dispatch', nodeId);
  const files = await readdir(dir).catch(() => []);

  const interims = files
    .filter(f => f.startsWith('interim-') && f.endsWith('.json'))
    .sort();

  const journal: JournalEntry[] = [];

  for (const file of interims) {
    const content = await readFile(join(dir, file), 'utf-8');
    journal.push(JSON.parse(content) as InterimHandoff);
  }

  // Append final if exists
  try {
    const content = await readFile(join(dir, 'handoff.json'), 'utf-8');
    journal.push(JSON.parse(content) as FinalHandoff);
  } catch {
    // No final yet
  }

  return journal;
}

// Aliases for agent-executor compatibility
export const saveInterim = writeInterimHandoff;
export const saveFinal = writeFinalHandoff;
