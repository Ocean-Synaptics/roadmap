/**
 * Git installation detector.
 * Detects git installation and retrieves version information.
 */

import { execSync } from 'node:child_process';

export interface GitCheckResult {
  installed: boolean;
  version?: string;
}

/**
 * Check if git is installed and retrieve version.
 */
export function checkGit(): GitCheckResult {
  try {
    const output = execSync('git --version', { encoding: 'utf-8' }).trim();
    // Output format: "git version 2.x.x..."
    const versionMatch = output.match(/git version (.+)/);
    const version = versionMatch?.[1] || output;
    return { installed: true, version };
  } catch {
    return { installed: false };
  }
}
