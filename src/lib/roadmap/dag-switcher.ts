// @module dag-switcher
// @exports DagSwitcher, switchDag, listDags, currentDag
// @types DagSwitchResult, DagListResult, DagInfo
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface DagInfo {
  id: string;
  dagId: string;
  path: string;
  isCurrent: boolean;
  nodes: number;
  desc?: string;
}

export interface DagSwitchResult {
  success: boolean;
  timestamp: string;
  prevDagId: string;
  newDagId: string;
  message: string;
  error?: string;
}

export interface DagListResult {
  success: boolean;
  timestamp: string;
  current: string;
  available: DagInfo[];
  count: number;
}

export class DagSwitcher {
  private repoRoot: string;
  private headJsonPath: string;
  private headJsonBackupPath: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.headJsonPath = join(repoRoot, '.roadmap', 'head.json');
    this.headJsonBackupPath = join(repoRoot, '.roadmap', 'head.json.backup');
  }

  /**
   * Get the ID of the currently active DAG from head.json
   */
  getCurrentDagId(): string {
    try {
      if (!existsSync(this.headJsonPath)) {
        throw new Error('head.json not found');
      }
      const content = readFileSync(this.headJsonPath, 'utf-8');
      const json = JSON.parse(content);
      return json.id || 'unknown';
    } catch (err) {
      throw new Error(`Failed to get current DAG ID: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * List all available DAGs in .roadmap directory
   */
  listAvailableDags(): DagInfo[] {
    const dags: DagInfo[] = [];
    const roadmapDir = join(this.repoRoot, '.roadmap');

    try {
      // Get current DAG ID if head.json exists
      let currentId: string | null = null;
      try {
        currentId = this.getCurrentDagId();
      } catch {
        // head.json doesn't exist, that's ok
      }

      const files = require('fs').readdirSync(roadmapDir);

      files.forEach((file: string) => {
        // Match head.{dag-id}.json pattern (but not head.json itself)
        const match = file.match(/^head\.(.+)\.json$/);
        if (!match || file === 'head.json') return;

        const dagId = match[1];
        const path = join(roadmapDir, file);

        try {
          const content = readFileSync(path, 'utf-8');
          const json = JSON.parse(content);
          const nodeCount = json.nodes ? Object.keys(json.nodes).length : 0;

          dags.push({
            id: json.id || dagId,
            dagId: dagId,
            path: path,
            isCurrent: currentId !== null && json.id === currentId,
            nodes: nodeCount,
            desc: json.desc,
          });
        } catch {
          // Skip unparseable files
        }
      });
    } catch (err) {
      throw new Error(`Failed to list DAGs: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // Sort by ID for consistent ordering
    return dags.sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Validate that a DAG exists and is readable
   */
  private validateDagExists(dagId: string): string {
    const dagPath = join(this.repoRoot, '.roadmap', `head.${dagId}.json`);

    if (!existsSync(dagPath)) {
      throw new Error(`DAG not found: head.${dagId}.json`);
    }

    try {
      const content = readFileSync(dagPath, 'utf-8');
      JSON.parse(content);
      return dagPath;
    } catch (err) {
      throw new Error(`Invalid DAG file: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /**
   * Switch to a different DAG
   * Creates backup of current head.json before switching
   */
  switchToDag(dagId: string): DagSwitchResult {
    const timestamp = new Date().toISOString();

    try {
      // Get current DAG ID before switch
      const prevDagId = this.getCurrentDagId();

      // Validate target DAG exists
      const targetDagPath = this.validateDagExists(dagId);

      // Create backup of current head.json
      if (existsSync(this.headJsonPath)) {
        copyFileSync(this.headJsonPath, this.headJsonBackupPath);
      }

      // Read target DAG
      const targetContent = readFileSync(targetDagPath, 'utf-8');
      const targetJson = JSON.parse(targetContent);

      // Update head.json to point to target DAG
      writeFileSync(this.headJsonPath, targetContent);

      // Update git-state.json to reflect the switch
      const gitStatePath = join(this.repoRoot, '.roadmap', 'git-state.json');
      try {
        const currentSha = execSync('git rev-parse HEAD', {
          cwd: this.repoRoot,
          encoding: 'utf-8',
        }).trim();

        const gitState = {
          lastCommit: currentSha,
          timestamp: timestamp,
          message: `DAG switched from ${prevDagId} to ${dagId}`,
        };

        writeFileSync(gitStatePath, JSON.stringify(gitState, null, 2) + '\n');
      } catch (err) {
        // Git may not be available, but that's ok — switch still succeeds
      }

      return {
        success: true,
        timestamp,
        prevDagId,
        newDagId: dagId,
        message: `Switched from ${prevDagId} to ${dagId}`,
      };
    } catch (err) {
      return {
        success: false,
        timestamp,
        prevDagId: 'unknown',
        newDagId: dagId,
        message: `Failed to switch DAG`,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  /**
   * Restore previous DAG from backup
   */
  restorePreviousDag(): DagSwitchResult {
    const timestamp = new Date().toISOString();

    try {
      if (!existsSync(this.headJsonBackupPath)) {
        throw new Error('No backup found');
      }

      const prevDagId = this.getCurrentDagId();

      // Restore from backup
      copyFileSync(this.headJsonBackupPath, this.headJsonPath);

      const content = readFileSync(this.headJsonPath, 'utf-8');
      const json = JSON.parse(content);
      const restoredDagId = json.id || 'unknown';

      return {
        success: true,
        timestamp,
        prevDagId: prevDagId,
        newDagId: restoredDagId,
        message: `Restored to ${restoredDagId}`,
      };
    } catch (err) {
      return {
        success: false,
        timestamp,
        prevDagId: 'unknown',
        newDagId: 'unknown',
        message: 'Failed to restore previous DAG',
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  /**
   * Get detailed info about a specific DAG
   */
  getDagInfo(dagId: string): DagInfo | null {
    const dags = this.listAvailableDags();
    const dag = dags.find((d) => d.dagId === dagId || d.id === dagId);
    return dag || null;
  }
}

/**
 * Standalone utility: switch to a DAG
 */
export function switchDag(repoRoot: string, dagId: string): DagSwitchResult {
  return new DagSwitcher(repoRoot).switchToDag(dagId);
}

/**
 * Standalone utility: list available DAGs
 */
export function listDags(repoRoot: string): DagListResult {
  const timestamp = new Date().toISOString();

  try {
    const switcher = new DagSwitcher(repoRoot);
    const current = switcher.getCurrentDagId();
    const available = switcher.listAvailableDags();

    return {
      success: true,
      timestamp,
      current,
      available,
      count: available.length,
    };
  } catch (err) {
    return {
      success: false,
      timestamp,
      current: 'unknown',
      available: [],
      count: 0,
    };
  }
}

/**
 * Standalone utility: get current DAG ID
 */
export function currentDag(repoRoot: string): string {
  return new DagSwitcher(repoRoot).getCurrentDagId();
}
