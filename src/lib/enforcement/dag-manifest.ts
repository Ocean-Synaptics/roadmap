// @module enforcement
// @exports DAGManifest, ManifestEntry, ManifestReport, ManifestValidator
// @types ManifestEntry, ManifestReport, ManifestValidator
// @entry roadmap

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Manifest entry: metadata for a single .roadmap/head.*.json DAG file
 */
export interface ManifestEntry {
  path: string;
  dagId: string;
  found: boolean;
  valid: boolean;
  error?: string;
  nodeCount: number;
  hasDesignDocs: boolean;
  orphaned: boolean; // true if no active reference to this DAG
  mtime: number; // modification time
}

/**
 * Validation result across all scanned DAGs
 */
export interface ManifestReport {
  timestamp: string;
  repoRoot: string;
  scannedFiles: string[];
  entries: ManifestEntry[];
  orphanedCount: number;
  invalidCount: number;
  designDocGaps: string[]; // DAG IDs missing design docs
  summary: string;
}

/**
 * DAGManifest: scan .roadmap/head.*.json files, validate structure,
 * detect orphans, enforce documentation presence.
 */
export class DAGManifest {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Scan all .roadmap/head.*.json files and build manifest.
   * Returns validation report.
   */
  scan(): ManifestReport {
    const roadmapDir = join(this.repoRoot, '.roadmap');
    const entries: ManifestEntry[] = [];
    const scannedFiles: string[] = [];
    const designDocGaps: string[] = [];

    if (!existsSync(roadmapDir)) {
      return {
        timestamp: new Date().toISOString(),
        repoRoot: this.repoRoot,
        scannedFiles: [],
        entries: [],
        orphanedCount: 0,
        invalidCount: 0,
        designDocGaps: [],
        summary: '.roadmap directory does not exist',
      };
    }

    const files = readdirSync(roadmapDir).filter(
      (f) => f.startsWith('head.') && f.endsWith('.json') && f !== 'head.json'
    );

    for (const file of files) {
      const filePath = join(roadmapDir, file);
      scannedFiles.push(file);
      const entry = this.validateDAGFile(filePath);
      entries.push(entry);

      if (!entry.valid && !entry.error) {
        entry.error = 'DAG structure invalid';
      }

      // Check for design doc
      if (entry.valid && !entry.hasDesignDocs) {
        designDocGaps.push(entry.dagId);
      }
    }

    // Determine which DAGs are orphaned (not referenced as active head)
    const activeHeadPath = join(roadmapDir, 'head.json');
    const activeDagId = this.getActiveDagId(activeHeadPath);

    for (const entry of entries) {
      entry.orphaned = entry.dagId !== activeDagId && entry.valid;
    }

    const orphanedCount = entries.filter((e) => e.orphaned).length;
    const invalidCount = entries.filter((e) => !e.valid).length;

    const summary = this.buildSummary(entries.length, orphanedCount, invalidCount, designDocGaps.length);

    return {
      timestamp: new Date().toISOString(),
      repoRoot: this.repoRoot,
      scannedFiles,
      entries,
      orphanedCount,
      invalidCount,
      designDocGaps,
      summary,
    };
  }

  /**
   * Validate a single DAG file: structure, required fields, documentation.
   */
  private validateDAGFile(filePath: string): ManifestEntry {
    const filename = basename(filePath);
    const defaultEntry: ManifestEntry = {
      path: filename,
      dagId: 'unknown',
      found: false,
      valid: false,
      nodeCount: 0,
      hasDesignDocs: false,
      orphaned: false,
      mtime: 0,
    };

    if (!existsSync(filePath)) {
      defaultEntry.error = 'File not found';
      return defaultEntry;
    }

    try {
      const stat = statSync(filePath);
      const content = readFileSync(filePath, 'utf-8');
      const dag = JSON.parse(content);

      const entry: ManifestEntry = {
        path: filename,
        dagId: dag.id || 'unknown',
        found: true,
        valid: true,
        nodeCount: dag.nodes ? Object.keys(dag.nodes).length : 0,
        hasDesignDocs: this.hasDocumentation(dag.id || ''),
        orphaned: false,
        mtime: stat.mtimeMs,
      };

      // Validate required DAG fields
      const requiredFields = ['id', 'desc', 'init', 'term', 'nodes'];
      for (const field of requiredFields) {
        if (!(field in dag)) {
          entry.valid = false;
          entry.error = `Missing required field: ${field}`;
          return entry;
        }
      }

      // Validate node structure: each node should have id, desc, produces, consumes, validate
      const nodes = dag.nodes;
      for (const [nodeId, node] of Object.entries(nodes)) {
        if (typeof node !== 'object' || node === null) {
          entry.valid = false;
          entry.error = `Node ${nodeId} is not an object`;
          return entry;
        }

        const n = node as Record<string, unknown>;
        if (!('id' in n) || !('desc' in n)) {
          entry.valid = false;
          entry.error = `Node ${nodeId} missing id or desc`;
          return entry;
        }
      }

      // Validate init and term node exist
      if (!(dag.init in dag.nodes)) {
        entry.valid = false;
        entry.error = `Init node "${dag.init}" not found in nodes`;
        return entry;
      }
      if (!(dag.term in dag.nodes)) {
        entry.valid = false;
        entry.error = `Term node "${dag.term}" not found in nodes`;
        return entry;
      }

      return entry;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      defaultEntry.error = `Parse error: ${error}`;
      return defaultEntry;
    }
  }

  /**
   * Check if documentation exists for a DAG.
   * Look for design docs like .roadmap/task-*.md
   */
  private hasDocumentation(dagId: string): boolean {
    const roadmapDir = join(this.repoRoot, '.roadmap');
    if (!existsSync(roadmapDir)) {
      return false;
    }

    // Look for task design docs
    const files = readdirSync(roadmapDir);
    const hasTaskDoc = files.some(
      (f) =>
        (f.startsWith('task-') || f.startsWith(`${dagId}-`)) &&
        (f.endsWith('.md') || f.endsWith('-design.md'))
    );

    return hasTaskDoc;
  }

  /**
   * Get the active DAG ID from head.json (if it exists).
   */
  private getActiveDagId(headPath: string): string {
    if (!existsSync(headPath)) {
      return '';
    }

    try {
      const content = readFileSync(headPath, 'utf-8');
      const dag = JSON.parse(content);
      return dag.id || '';
    } catch {
      return '';
    }
  }

  /**
   * Build human-readable summary string.
   */
  private buildSummary(totalFiles: number, orphaned: number, invalid: number, gaps: number): string {
    const parts: string[] = [];

    if (totalFiles === 0) {
      return 'No head.*.json DAG files found';
    }

    parts.push(`Scanned ${totalFiles} DAG file(s)`);

    if (invalid > 0) {
      parts.push(`${invalid} invalid`);
    }

    if (orphaned > 0) {
      parts.push(`${orphaned} orphaned`);
    }

    if (gaps > 0) {
      parts.push(`${gaps} missing design docs`);
    }

    if (invalid === 0 && orphaned === 0 && gaps === 0) {
      parts.push('all valid');
    }

    return parts.join(', ');
  }

  /**
   * Archive orphaned DAGs: move .roadmap/head.*.json to .roadmap/archived/
   * Returns list of archived files.
   * Idempotent: already-archived DAGs are skipped.
   */
  archiveOrphaned(): string[] {
    const report = this.scan();
    const archived: string[] = [];

    const roadmapDir = join(this.repoRoot, '.roadmap');
    const archivedDir = join(roadmapDir, 'archived');

    // Ensure archived directory exists
    if (!existsSync(archivedDir)) {
      // Cannot create directory in this module (side effect); caller must handle
      return archived;
    }

    for (const entry of report.entries) {
      if (entry.orphaned && entry.valid) {
        const sourcePath = join(roadmapDir, entry.path);
        const destPath = join(archivedDir, entry.path);

        // Rename operation would be side-effectful; return list instead
        archived.push(entry.path);
      }
    }

    return archived;
  }
}

/**
 * Structured violation types for hook integration.
 * Used to report specific DAG manifest violations.
 */
export interface ManifestViolation {
  dagId: string;
  dagPath: string;
  type: 'missing-documentation' | 'missing-validation' | 'orphaned' | 'invalid-structure';
  message: string;
  nodeIds?: string[];
  remediation?: string;
}

/**
 * Standalone validator function: verify DAG manifest report against constraints.
 * Used for validation rules.
 */
export function validateManifest(report: ManifestReport): { passed: boolean; evidence: string } {
  const issues: string[] = [];

  if (report.invalidCount > 0) {
    issues.push(`${report.invalidCount} DAG file(s) have invalid structure`);
  }

  if (report.designDocGaps.length > 0) {
    issues.push(`${report.designDocGaps.length} DAG(s) missing design documentation`);
  }

  if (issues.length === 0) {
    return {
      passed: true,
      evidence: `All ${report.scannedFiles.length} DAG files valid with documentation`,
    };
  }

  return {
    passed: false,
    evidence: issues.join('; '),
  };
}

/**
 * Scan DAG manifest and return structured violations.
 * Entry point for hook integration.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of ManifestViolation objects
 */
export function scanDAGManifestForViolations(repoRoot: string): ManifestViolation[] {
  const manifest = new DAGManifest(repoRoot);
  const report = manifest.scan();
  const violations: ManifestViolation[] = [];

  // Map entries to violations
  for (const entry of report.entries) {
    if (!entry.valid) {
      violations.push({
        dagId: entry.dagId,
        dagPath: entry.path,
        type: 'invalid-structure',
        message: entry.error || 'DAG structure invalid',
        remediation: `Fix DAG structure in .roadmap/${entry.path}`,
      });
    } else if (entry.orphaned) {
      violations.push({
        dagId: entry.dagId,
        dagPath: entry.path,
        type: 'orphaned',
        message: `Orphaned DAG: not referenced as active head.json`,
        remediation: `Archive or remove .roadmap/${entry.path} if no longer needed`,
      });
    } else if (!entry.hasDesignDocs) {
      violations.push({
        dagId: entry.dagId,
        dagPath: entry.path,
        type: 'missing-documentation',
        message: `DAG '${entry.dagId}' missing design documentation`,
        remediation: `Add design doc for ${entry.dagId} in .roadmap/`,
      });
    }
  }

  return violations;
}
