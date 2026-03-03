// @module gemini-agent
// @exports GeminiAgent
// @types GeminiAgentOptions, GeminiAgentResult
// @entry roadmap

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Options for GeminiAgent initialization
 */
export interface GeminiAgentOptions {
  workspaceDir?: string;
  timeout?: number; // milliseconds, default 30000
  verbose?: boolean;
}

/**
 * Result of a Gemini CLI command execution
 */
export interface GeminiAgentResult {
  success: boolean;
  output: string;
  error?: string;
  code?: number;
}

/**
 * GeminiAgent provides shell wrappers for Gemini CLI commands
 * to integrate with the spec-kit pipeline
 */
export class GeminiAgent {
  private workspaceDir: string;
  private timeout: number;
  private verbose: boolean;

  constructor(options: GeminiAgentOptions = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.timeout = options.timeout ?? 30000;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Capture constitution (project principles, constraints, non-goals, definitions)
   * Takes markdown input and returns parsed constitution structure
   */
  constitution(input: string): GeminiAgentResult {
    return this.executeCommand('constitution', input);
  }

  /**
   * Generate specification from pre-spec
   * Takes pre-spec markdown and returns structured specification with scenarios
   */
  specify(input: string): GeminiAgentResult {
    return this.executeCommand('specify', input);
  }

  /**
   * Produce technical plan from specification
   * Takes specification and returns architecture, tech stack, design decisions
   */
  plan(input: string): GeminiAgentResult {
    return this.executeCommand('plan', input);
  }

  /**
   * Generate tasks from specification and plan
   * Takes spec + plan and returns decomposed tasks with dependencies
   */
  generateTasks(input: string): GeminiAgentResult {
    return this.executeCommand('tasks', input);
  }

  /**
   * Execute a Gemini CLI command with markdown input
   * Minimal shell wrapper implementation
   */
  private executeCommand(command: string, input: string): GeminiAgentResult {
    if (!input || typeof input !== 'string') {
      return {
        success: false,
        output: '',
        error: `Invalid input: expected markdown string for '${command}' command`,
      };
    }

    try {
      // Check if Gemini CLI is available
      if (!this.isGeminiAvailable()) {
        return {
          success: false,
          output: '',
          error: 'Gemini CLI not found. Ensure Google Cloud SDK is installed and gcloud auth is configured.',
        };
      }

      // Create a temporary file with input for stdin (alternative to pipe)
      // For now, we'll use a minimal echo+pipe approach
      const escapedInput = input.replace(/'/g, "'\\''");
      const cmdStr = `echo '${escapedInput}' | gcloud ai analyze-text --input-type=raw --format=json`;

      if (this.verbose) {
        console.log(`[GeminiAgent] Executing: ${command}`);
      }

      const output = execSync(cmdStr, {
        cwd: this.workspaceDir,
        timeout: this.timeout,
        encoding: 'utf-8',
      });

      return {
        success: true,
        output,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error,
        code: err instanceof Error && 'code' in err ? (err as any).code : undefined,
      };
    }
  }

  /**
   * Check if Gemini CLI is available in PATH
   */
  private isGeminiAvailable(): boolean {
    try {
      execSync('which gcloud', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

export default GeminiAgent;
