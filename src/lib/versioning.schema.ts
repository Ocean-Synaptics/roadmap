/**
 * Versioning schema: DAG version + protocol compatibility
 */

export type ProtocolVersion = '0.1.0' | '0.2.0' | '0.3.0' | '0.4.0';
export const CURRENT_PROTOCOL_VERSION: ProtocolVersion = '0.4.0';

export interface VersionInfo {
  readonly version: string; // DAG version (semver)
  readonly protocolVersion: ProtocolVersion;
}

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly required?: string;
  readonly needsMigration?: boolean;
  readonly migrations?: ProtocolVersion[];
  readonly message?: string;
}

const versionOrder: Record<ProtocolVersion, number> = {
  '0.1.0': 1,
  '0.2.0': 2,
  '0.3.0': 3,
  '0.4.0': 4,
};

const versions: ProtocolVersion[] = ['0.1.0', '0.2.0', '0.3.0', '0.4.0'];

/**
 * Check if a DAG's protocol version is compatible with current
 */
export function checkCompatibility(
  dagProtocolVersion: string,
  currentProtocolVersion: ProtocolVersion = CURRENT_PROTOCOL_VERSION,
): CompatibilityResult {
  const dagOrder = versionOrder[dagProtocolVersion as ProtocolVersion];
  const currentOrder = versionOrder[currentProtocolVersion];

  if (!dagOrder) {
    return {
      compatible: false,
      required: currentProtocolVersion,
      message: `Unknown DAG protocol version: ${dagProtocolVersion}`,
    };
  }

  if (dagOrder > currentOrder) {
    return {
      compatible: false,
      message: `DAG requires newer protocol: ${dagProtocolVersion} (have ${currentProtocolVersion})`,
    };
  }

  if (dagOrder === currentOrder) {
    return { compatible: true };
  }

  // Compute migration path
  const migrations: ProtocolVersion[] = [];
  for (let i = dagOrder; i < currentOrder; i++) {
    migrations.push(versions[i]);
  }

  return {
    compatible: true,
    needsMigration: true,
    migrations,
  };
}

/**
 * Migration registry: how to upgrade from version N to N+1
 */
export const migrations: Record<string, (dag: any) => any> = {
  '0.3.0->0.4.0': (dag: any) => {
    // v0.4.0 strips legacy node fields: priority, depends, ambient, provenance, idempotent
    // Wiring is now consumes ↔ produces only.
    for (const node of Object.values(dag.nodes ?? {}) as any[]) {
      const n = node as any;
      delete n.priority;
      delete n.depends;
      delete n.ambient;
      delete n.provenance;
      delete n.idempotent;
    }
    return dag;
  },
};

/**
 * Apply migration chain to DAG
 */
export function migrateDAG(dag: any, targetVersion: ProtocolVersion): any {
  const compat = checkCompatibility(dag.protocolVersion, targetVersion);

  if (!compat.needsMigration) {
    return dag;
  }

  let current = dag;
  const currentIdx = versions.indexOf(dag.protocolVersion as ProtocolVersion);
  const targetIdx = versions.indexOf(targetVersion);

  for (let i = currentIdx; i < targetIdx; i++) {
    const from = versions[i];
    const to = versions[i + 1];
    const key = `${from}->${to}`;

    if (migrations[key]) {
      current = migrations[key](current);
      current.protocolVersion = to;
    }
  }

  return current;
}

/**
 * Validate version field exists and is string
 */
export function hasVersioning(dag: unknown): dag is { version: string; protocolVersion: string } {
  if (!dag || typeof dag !== 'object') return false;
  const d = dag as Record<string, unknown>;
  return typeof d.version === 'string' && typeof d.protocolVersion === 'string';
}
