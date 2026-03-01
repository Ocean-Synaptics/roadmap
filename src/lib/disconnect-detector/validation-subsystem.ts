// Validation rule detector — scans for invalid/unrunnable validation rules

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types';

export interface ValidationSubsystemInput {
  roadmapRoot: string;
  headPath?: string;
}

export class ValidationDetector {
  private root: string;
  private headPath: string;

  constructor(input: ValidationSubsystemInput) {
    this.root = input.roadmapRoot;
    this.headPath = input.headPath || path.join(this.root, '.roadmap/head.json');
  }

  async scan(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    if (!fs.existsSync(this.headPath)) {
      return issues;
    }

    try {
      const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
      const nodes = head.nodes || head.dag?.nodes || {};

      for (const [nodeId, node] of Object.entries(nodes)) {
        const n = node as any;
        if (n.validate && Array.isArray(n.validate)) {
          for (const rule of n.validate) {
            const ruleIssues = this.validateRule(nodeId, rule);
            issues.push(...ruleIssues);
          }
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        detail: `Failed to parse head.json validation rules: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warn',
      });
    }

    return issues;
  }

  private validateRule(nodeId: string, rule: any): DAGMismatch[] {
    const issues: DAGMismatch[] = [];

    if (rule.type === 'artifact-exists') {
      if (!rule.path) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: artifact-exists rule missing 'path'`,
          severity: 'warn',
        });
      }
    } else if (rule.type === 'shell') {
      if (!rule.command) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: shell rule missing 'command'`,
          severity: 'warn',
        });
      }
    } else if (rule.type === 'spec-conformance') {
      if (!rule.spec || !rule.scenario) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: spec-conformance rule missing 'spec' or 'scenario'`,
          severity: 'warn',
        });
      } else if (!fs.existsSync(path.join(this.root, rule.spec))) {
        issues.push({
          type: 'state-divergence',
          detail: `Node ${nodeId}: spec file not found: ${rule.spec}`,
          severity: 'error',
        });
      }
    }

    return issues;
  }
}

export async function detectValidationIssues(input: ValidationSubsystemInput): Promise<DAGMismatch[]> {
  const detector = new ValidationDetector(input);
  return detector.scan();
}
