// @module recovery
// @exports Checkpoint, CheckpointState, CheckpointManifest, isValidCheckpoint
// @types Checkpoint, CheckpointState, CheckpointManifest
// @entry roadmap/recovery

/**
 * Checkpoint: saved session state at a named recovery point.
 * Enables restore without re-running early work.
 */
export type Checkpoint = {
  /** User-friendly label (e.g., v1.0.0, release, stable) */
  label: string;
  /** Position in DAG at checkpoint time */
  position: string[];
  /** When checkpoint was created */
  timestamp: string;
  /** Git commit hash at checkpoint */
  commit: string;
  /** Artifacts that existed at checkpoint */
  artifacts: Record<string, boolean>;
};

/**
 * Checkpoint state file (in .roadmap/checkpoints/{label}/state.json).
 */
export type CheckpointState = {
  label: string;
  position: string[];
  timestamp: string;
  commit: string;
  artifacts: Record<string, boolean>;
  version?: string;
};

/**
 * Checkpoint manifest (metadata about checkpoint).
 */
export type CheckpointManifest = {
  label: string;
  created: string;
  position: string[];
  commit: string;
  author?: string;
  description?: string;
};

/**
 * Validate checkpoint structure.
 */
export function isValidCheckpoint(obj: unknown): obj is Checkpoint {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;

  return (
    typeof c.label === 'string' &&
    Array.isArray(c.position) &&
    c.position.every((p: unknown) => typeof p === 'string') &&
    typeof c.timestamp === 'string' &&
    typeof c.commit === 'string' &&
    typeof c.artifacts === 'object' &&
    c.artifacts !== null
  );
}

/**
 * Validate checkpoint state.
 */
export function isValidCheckpointState(obj: unknown): obj is CheckpointState {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as Record<string, unknown>;

  return (
    typeof s.label === 'string' &&
    Array.isArray(s.position) &&
    s.position.every((p: unknown) => typeof p === 'string') &&
    typeof s.timestamp === 'string' &&
    typeof s.commit === 'string' &&
    typeof s.artifacts === 'object' &&
    s.artifacts !== null
  );
}

/**
 * Create a new checkpoint.
 */
export function createCheckpoint(
  label: string,
  position: string[],
  commit: string,
  artifacts: Record<string, boolean>,
): Checkpoint {
  return {
    label,
    position,
    timestamp: new Date().toISOString(),
    commit,
    artifacts,
  };
}

/**
 * Create checkpoint state for serialization.
 */
export function createCheckpointState(checkpoint: Checkpoint, version = '1'): CheckpointState {
  return {
    ...checkpoint,
    version,
  };
}

/**
 * Create checkpoint manifest.
 */
export function createCheckpointManifest(
  checkpoint: Checkpoint,
  author?: string,
  description?: string,
): CheckpointManifest {
  return {
    label: checkpoint.label,
    created: checkpoint.timestamp,
    position: checkpoint.position,
    commit: checkpoint.commit,
    author,
    description,
  };
}

/**
 * Get artifact names at checkpoint.
 */
export function getCheckpointArtifacts(checkpoint: Checkpoint): string[] {
  return Object.entries(checkpoint.artifacts)
    .filter(([, exists]) => exists)
    .map(([name]) => name);
}

/**
 * Check if artifact existed at checkpoint.
 */
export function hadArtifact(checkpoint: Checkpoint, artifactName: string): boolean {
  return checkpoint.artifacts[artifactName] === true;
}
