/**
 * Checkpoint schema: save/restore roadmap state
 */

export interface Artifact {
  readonly path: string;
  readonly hash: string; // sha256
}

export interface GitState {
  readonly branch: string;
  readonly headHash: string;
  readonly clean: boolean;
}

export interface CheckpointMetadata {
  readonly agent: string;
  readonly phase: string;
  readonly duration: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface Checkpoint {
  readonly id: string; // cp-{timestamp}
  readonly timestamp: number; // ms since epoch
  readonly roadmapPosition: string[]; // current batch (array of node IDs)
  readonly phase: string; // human-readable phase name
  readonly artifacts: readonly Artifact[];
  readonly gitState: GitState;
  readonly metadata: CheckpointMetadata;
}

export function validateCheckpoint(c: unknown): c is Checkpoint {
  if (!c || typeof c !== 'object') return false;
  const ck = c as Record<string, unknown>;
  const validPosition = Array.isArray(ck.roadmapPosition) &&
    ck.roadmapPosition.every(p => typeof p === 'string');
  return (
    typeof ck.id === 'string' &&
    typeof ck.timestamp === 'number' &&
    validPosition &&
    Array.isArray(ck.artifacts) &&
    typeof ck.gitState === 'object' && ck.gitState !== null &&
    typeof ck.metadata === 'object' && ck.metadata !== null
  );
}

export async function readCheckpoint(repoRoot: string, cpId: string): Promise<Checkpoint | null> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    const content = await readFile(join(repoRoot, '.roadmap', 'checkpoints', `${cpId}.json`), 'utf-8');
    const parsed = JSON.parse(content);
    return validateCheckpoint(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readLatestCheckpoint(repoRoot: string): Promise<Checkpoint | null> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    const checkpointsDir = join(repoRoot, '.roadmap', 'checkpoints');
    const files = await readdir(checkpointsDir);
    if (files.length === 0) return null;

    // Sort by timestamp (cp-YYYYMMDD-HHMMSS format)
    const sorted = files.sort().reverse();
    const latest = sorted[0].replace('.json', '');
    return readCheckpoint(repoRoot, latest);
  } catch {
    return null;
  }
}

export async function writeCheckpoint(repoRoot: string, checkpoint: Checkpoint): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const checkpointsDir = join(repoRoot, '.roadmap', 'checkpoints');
  await mkdir(checkpointsDir, { recursive: true });
  await writeFile(join(checkpointsDir, `${checkpoint.id}.json`), JSON.stringify(checkpoint, null, 2));
}

export function generateCheckpointId(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[^\d]/g, '').slice(0, 14);
  return `cp-${stamp}`;
}
