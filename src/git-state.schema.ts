// @module versioning
// @exports GitState, GitStateArtifact, GitStateCheckpoint, isValidGitState
// @types GitState, GitStateArtifact, GitStateCheckpoint
// @entry roadmap/versioning

/**
 * Git-state metadata: artifact presence tracking by git ref.
 * Written after each session to enable recovery from prior commits.
 */
export type GitState = {
  /** Schema version for migration */
  version: string;
  /** Timestamp of last write */
  timestamp?: string;
  /** artifact path → git ref where it first appeared */
  artifacts: Record<string, GitStateArtifact>;
  /** Named recovery checkpoints */
  checkpoints?: Record<string, GitStateCheckpoint>;
};

/**
 * Artifact presence record.
 * Single ref: artifact exists from this commit onward (via reachability).
 */
export type GitStateArtifact = string;

/**
 * Named checkpoint for recovery.
 */
export type GitStateCheckpoint = {
  /** Git ref (commit hash, tag, branch) */
  commit: string;
  /** Position in DAG at checkpoint time (batch of nodes) */
  position: string[];
  /** When checkpoint was recorded */
  timestamp?: string;
  /** Optional label/description */
  label?: string;
};

/**
 * Validate git-state structure and contents.
 */
export function isValidGitState(obj: unknown): obj is GitState {
  if (typeof obj !== 'object' || obj === null) return false;
  const g = obj as Record<string, unknown>;

  // version required
  if (typeof g.version !== 'string') return false;

  // artifacts required, must be Record<string, string>
  if (typeof g.artifacts !== 'object' || g.artifacts === null) return false;
  for (const [, v] of Object.entries(g.artifacts)) {
    if (typeof v !== 'string') return false;
  }

  // checkpoints optional, but if present must be valid
  if (g.checkpoints !== undefined && g.checkpoints !== null) {
    if (typeof g.checkpoints !== 'object') return false;
    for (const [, checkpoint] of Object.entries(g.checkpoints)) {
      if (!isValidCheckpoint(checkpoint)) return false;
    }
  }

  return true;
}

function isValidCheckpoint(obj: unknown): obj is GitStateCheckpoint {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.commit === 'string' &&
    Array.isArray(c.position) &&
    c.position.every((p: unknown) => typeof p === 'string')
  );
}

/**
 * Create empty git-state.
 */
export function createGitState(): GitState {
  return {
    version: '1',
    timestamp: new Date().toISOString(),
    artifacts: {},
    checkpoints: {},
  };
}

/**
 * Record artifact at git ref.
 */
export function recordArtifact(state: GitState, path: string, ref: string): GitState {
  return {
    ...state,
    artifacts: { ...state.artifacts, [path]: ref },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Record checkpoint.
 */
export function recordCheckpoint(
  state: GitState,
  label: string,
  commit: string,
  position: string[],
): GitState {
  return {
    ...state,
    checkpoints: {
      ...state.checkpoints,
      [label]: { commit, position, timestamp: new Date().toISOString() },
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get artifact ref, or undefined if not recorded.
 */
export function getArtifactRef(state: GitState, path: string): string | undefined {
  return state.artifacts[path];
}

/**
 * Get checkpoint, or undefined if not recorded.
 */
export function getCheckpoint(state: GitState, label: string): GitStateCheckpoint | undefined {
  return state.checkpoints?.[label];
}
