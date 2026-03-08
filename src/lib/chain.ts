// @module chain
// @description Convergence chain storage — append-only JSONL chain linking DAG iterations
// @exports ChainLink, appendLink, loadChain, currentIteration, archiveHead, getRootIntent
// @entry roadmap/chain

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// TODO: ExecutionReport will be defined by a downstream node — placeholder for now
export interface ExecutionReport {
  nodesCompleted: number;
  nodesTotal: number;
  validationsPassed: number;
  validationsFailed: number;
}

export interface ChainLink {
  dagId: string;
  iteration: number;
  predecessorId: string | null;
  completedAt: string; // ISO timestamp
  successorDagId: string | null;
  executionReport?: ExecutionReport;
}

export interface HeadIndexEntry {
  dagId: string;
  path: string;
  predecessor: string | null;
}

const CHAIN_FILE = '.roadmap/chain.jsonl';
const HEAD_FILE = '.roadmap/head.json';
const HEADS_DIR = '.roadmap/heads';
const HEAD_INDEX_FILE = '.roadmap/head-index.json';

/** Append a ChainLink as a JSON line to .roadmap/chain.jsonl */
export function appendLink(repoRoot: string, link: ChainLink): void {
  const filePath = join(repoRoot, CHAIN_FILE);
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(filePath, JSON.stringify(link) + '\n');
}

/** Read all links from chain.jsonl, return as array */
export function loadChain(repoRoot: string): ChainLink[] {
  const filePath = join(repoRoot, CHAIN_FILE);
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ChainLink);
}

/** Return the highest iteration number from chain, or 0 if empty */
export function currentIteration(repoRoot: string): number {
  const chain = loadChain(repoRoot);
  if (chain.length === 0) return 0;
  return Math.max(...chain.map((link) => link.iteration));
}

/**
 * Archive current head.json:
 * 1. Read .roadmap/head.json, extract its `id` field
 * 2. Move file to .roadmap/heads/<dagId>.json
 * 3. Update .roadmap/head-index.json adding entry with predecessor link
 */
export function archiveHead(repoRoot: string): void {
  const headPath = join(repoRoot, HEAD_FILE);
  if (!existsSync(headPath)) {
    throw new Error(`No head.json found at ${headPath}`);
  }

  const headContent = readFileSync(headPath, 'utf-8');
  const head = JSON.parse(headContent) as { id: string };
  const dagId = head.id;

  // Ensure heads/ directory exists
  const headsDir = join(repoRoot, HEADS_DIR);
  if (!existsSync(headsDir)) mkdirSync(headsDir, { recursive: true });

  // Move head.json to heads/<dagId>.json
  const archivePath = join(headsDir, `${dagId}.json`);
  renameSync(headPath, archivePath);

  // Load existing head-index.json or start fresh
  const indexPath = join(repoRoot, HEAD_INDEX_FILE);
  let index: HeadIndexEntry[] = [];
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, 'utf-8')) as HeadIndexEntry[];
  }

  // Determine predecessor: last entry in index, or null
  const predecessor = index.length > 0 ? index[index.length - 1].dagId : null;

  index.push({
    dagId,
    path: `heads/${dagId}.json`,
    predecessor,
  });

  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
}

/**
 * Walk the chain back to iteration 0 and read that DAG's desc field
 * from the archived head (.roadmap/heads/<dagId>.json).
 * If chain is empty, read current head.json desc.
 */
export function getRootIntent(repoRoot: string): string {
  const chain = loadChain(repoRoot);

  if (chain.length === 0) {
    // No chain entries — read current head.json
    const headPath = join(repoRoot, HEAD_FILE);
    if (!existsSync(headPath)) {
      throw new Error(`No head.json and no chain entries — cannot determine root intent`);
    }
    const head = JSON.parse(readFileSync(headPath, 'utf-8')) as { desc: string };
    return head.desc;
  }

  // Find iteration 0's dagId
  const rootLink = chain.find((link) => link.iteration === 0);
  if (!rootLink) {
    throw new Error(`Chain has entries but no iteration 0 — chain is corrupt`);
  }

  const archivePath = join(repoRoot, HEADS_DIR, `${rootLink.dagId}.json`);
  if (!existsSync(archivePath)) {
    throw new Error(`Archived head for root DAG ${rootLink.dagId} not found at ${archivePath}`);
  }

  const archived = JSON.parse(readFileSync(archivePath, 'utf-8')) as { desc: string };
  return archived.desc;
}
