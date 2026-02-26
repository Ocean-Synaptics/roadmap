// @module versioning
// @exports GraphVersion, isSupportedVersion, getCurrentVersion, migrate
// @types GraphVersion
// @entry roadmap/versioning

/**
 * Supported graph versions.
 */
export type GraphVersion = '1' | '2';

/**
 * Current schema version.
 */
export const CURRENT_VERSION: GraphVersion = '1';

/**
 * Check if version is supported.
 */
export function isSupportedVersion(version: unknown): version is GraphVersion {
  return version === '1' || version === '2';
}

/**
 * Get current version.
 */
export function getCurrentVersion(): GraphVersion {
  return CURRENT_VERSION;
}

/**
 * Migration function type.
 */
export type Migration<TFrom, TTo> = (graph: TFrom) => TTo;

/**
 * Migrate graph from old version to current version.
 */
export function migrate(graph: any): any {
  const version = graph.version || '1';

  if (!isSupportedVersion(version)) {
    throw new Error(`Unsupported graph version: ${version}`);
  }

  if (version === CURRENT_VERSION) {
    return graph;
  }

  // Apply migrations in sequence
  let migrated = graph;
  if (version === '1' && CURRENT_VERSION === '2') {
    migrated = migrateV1ToV2(migrated);
  }

  return migrated;
}

/**
 * V1 to V2 migration: adds optional fields.
 */
function migrateV1ToV2(g: any): any {
  return {
    ...g,
    version: '2',
    protocolVersion: g.protocolVersion || 'v0.5.0',
    nodes: Object.fromEntries(
      Object.entries(g.nodes || {}).map(([id, node]: [string, any]) => [
        id,
        {
          ...node,
          timeout: node.timeout,
          retry: node.retry || 0,
        },
      ]),
    ),
  };
}

/**
 * Get migration path for version.
 */
export function getMigrationPath(fromVersion: GraphVersion): GraphVersion[] {
  if (fromVersion === CURRENT_VERSION) {
    return [];
  }

  if (fromVersion === '1' && CURRENT_VERSION === '2') {
    return ['1', '2'];
  }

  throw new Error(`No migration path from ${fromVersion} to ${CURRENT_VERSION}`);
}
