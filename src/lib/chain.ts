// @module chain
// @description Convergence chain storage — lineage embedded on archived DAG heads
// @exports ChainLink, ExecutionReport, archiveHead, getRootIntent, parseExecutionReport
// @entry roadmap/chain

import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ExecutionReport {
  nodesExecuted: number;
  totalDuration: number; // milliseconds
  retriesPerNode: Record<string, number>;
  tokensConsumed?: number;
  observations: string[];
  blockers: string[];
  deltaAssessment: string;
}

export interface ChainLink {
  dagId: string;
  iteration: number;
  predecessorId: string | null;
  completedAt: string; // ISO timestamp
  successorDagId: string | null;
  executionReport?: ExecutionReport;
}

/** Lineage metadata embedded on archived DAG heads */
export interface Lineage {
  iteration: number;
  predecessorId: string | null;
  completedAt: string;
  executionReport?: ExecutionReport;
}

const HEAD_FILE = '.roadmap/head.json';
const HEADS_DIR = '.roadmap/heads';

/**
 * Archive current head.json with embedded lineage:
 * 1. Read .roadmap/head.json, extract its `id` field
 * 2. Attach _lineage metadata to the JSON
 * 3. Write enriched version to .roadmap/heads/<dagId>.json
 * 4. Delete head.json
 */
export function archiveHead(repoRoot: string, lineage: Lineage): void {
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

  // Write enriched head to heads/<dagId>.json with _lineage field
  const enriched = { ...head, _lineage: lineage };
  const archivePath = join(headsDir, `${dagId}.json`);
  writeFileSync(archivePath, JSON.stringify(enriched, null, 2) + '\n');

  // Remove head.json
  unlinkSync(headPath);
}

/**
 * Read all archived heads from heads/*.json, extract _lineage fields.
 * Returns ChainLink-compatible objects sorted by iteration.
 */
export function loadChainFromHeads(repoRoot: string): ChainLink[] {
  const headsDir = join(repoRoot, HEADS_DIR);
  if (!existsSync(headsDir)) return [];

  const links: ChainLink[] = [];
  let files: string[];
  try {
    files = readdirSync(headsDir).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(headsDir, file), 'utf-8');
      const parsed = JSON.parse(content) as { id?: string; _lineage?: Lineage };
      if (!parsed._lineage) continue;
      const lin = parsed._lineage;
      links.push({
        dagId: parsed.id ?? file.replace('.json', ''),
        iteration: lin.iteration,
        predecessorId: lin.predecessorId,
        completedAt: lin.completedAt,
        successorDagId: null, // not stored in lineage
        executionReport: lin.executionReport,
      });
    } catch {
      // Skip malformed heads
    }
  }

  return links.sort((a, b) => a.iteration - b.iteration);
}

/**
 * Walk heads/*.json to find iteration 0 (or lowest) and read that DAG's desc.
 * If no heads exist, read current head.json desc.
 */
export function getRootIntent(repoRoot: string): string {
  const links = loadChainFromHeads(repoRoot);

  if (links.length === 0) {
    // No archived heads — read current head.json
    const headPath = join(repoRoot, HEAD_FILE);
    if (!existsSync(headPath)) {
      throw new Error(`No head.json and no chain entries — cannot determine root intent`);
    }
    const head = JSON.parse(readFileSync(headPath, 'utf-8')) as { desc: string };
    return head.desc;
  }

  // Find iteration 0's dagId (or lowest)
  const rootLink = links.reduce((min, l) => l.iteration < min.iteration ? l : min, links[0]);

  const archivePath = join(repoRoot, HEADS_DIR, `${rootLink.dagId}.json`);
  if (!existsSync(archivePath)) {
    throw new Error(`Archived head for root DAG ${rootLink.dagId} not found at ${archivePath}`);
  }

  const archived = JSON.parse(readFileSync(archivePath, 'utf-8')) as { desc: string };
  return archived.desc;
}

/**
 * Read and validate a JSON file as an ExecutionReport.
 * Throws with a descriptive error if the file doesn't match the schema.
 */
export function parseExecutionReport(filePath: string): ExecutionReport {
  if (!existsSync(filePath)) {
    throw new Error(`ExecutionReport file not found: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

  // Validate required fields
  if (typeof raw.nodesExecuted !== 'number') throw new Error('ExecutionReport: nodesExecuted must be a number');
  if (typeof raw.totalDuration !== 'number') throw new Error('ExecutionReport: totalDuration must be a number');
  if (typeof raw.retriesPerNode !== 'object' || raw.retriesPerNode === null) throw new Error('ExecutionReport: retriesPerNode must be an object');
  if (!Array.isArray(raw.observations)) throw new Error('ExecutionReport: observations must be an array');
  if (!Array.isArray(raw.blockers)) throw new Error('ExecutionReport: blockers must be an array');
  if (typeof raw.deltaAssessment !== 'string') throw new Error('ExecutionReport: deltaAssessment must be a string');

  return {
    nodesExecuted: raw.nodesExecuted,
    totalDuration: raw.totalDuration,
    retriesPerNode: raw.retriesPerNode,
    tokensConsumed: typeof raw.tokensConsumed === 'number' ? raw.tokensConsumed : undefined,
    observations: raw.observations,
    blockers: raw.blockers,
    deltaAssessment: raw.deltaAssessment,
  };
}
