// @module corruption-detector
// @description Detect completion state corruption: orphaned claims, stale locks, inconsistent artifacts
// @exports detectCorruption, CorruptionIssue, CorruptionSeverity, CorruptionReport
// @entry roadmap/completion

import type { ClaimStore, NodeClaim } from '../claims/claims.ts';
import { isExpired } from '../claims/claims.ts';

export type CorruptionSeverity = 'error' | 'warning' | 'info';

export type CorruptionType =
  | 'orphaned-claim'       // claim exists for node not in DAG
  | 'stale-lock'           // claim expired but not released
  | 'completed-unclaimed'  // node marked complete but never had a claim
  | 'claimed-completed'    // active claim on already-completed node
  | 'phantom-completion'   // completion record for node not in DAG
  | 'missing-artifact';    // node marked complete but produced artifact missing

export interface CorruptionIssue {
  type: CorruptionType;
  severity: CorruptionSeverity;
  nodeId: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface CorruptionReport {
  issues: CorruptionIssue[];
  scanned: { nodes: number; claims: number; completions: number };
  clean: boolean;
}

export interface DetectorInput {
  /** All node IDs defined in head.json */
  dagNodeIds: Set<string>;
  /** Current claims store */
  claims: ClaimStore;
  /** Set of node IDs with passing completion records */
  completedNodeIds: Set<string>;
  /** Check whether a produced artifact exists on disk */
  artifactExists: (path: string) => boolean;
  /** Map of nodeId -> produces paths (from DAG node specs) */
  nodeProduces: Record<string, string[]>;
  /** Reference time for expiry checks */
  now?: Date;
}

// -- Detectors --

function detectOrphanedClaims(input: DetectorInput): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];
  for (const [nodeId, claim] of Object.entries(input.claims)) {
    if (!input.dagNodeIds.has(nodeId)) {
      issues.push({
        type: 'orphaned-claim',
        severity: 'error',
        nodeId,
        message: `Claim by "${claim.owner}" for node not in DAG`,
        detail: { owner: claim.owner, claimedAt: claim.claimedAt },
      });
    }
  }
  return issues;
}

function detectStaleLocks(input: DetectorInput): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];
  const now = input.now ?? new Date();
  for (const [nodeId, claim] of Object.entries(input.claims)) {
    if (isExpired(claim, now) && !input.completedNodeIds.has(nodeId)) {
      issues.push({
        type: 'stale-lock',
        severity: 'warning',
        nodeId,
        message: `Expired claim by "${claim.owner}" (expired ${claim.claimExpiry}), node not completed`,
        detail: { owner: claim.owner, claimExpiry: claim.claimExpiry },
      });
    }
  }
  return issues;
}

function detectClaimedCompleted(input: DetectorInput): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];
  const now = input.now ?? new Date();
  for (const [nodeId, claim] of Object.entries(input.claims)) {
    if (!isExpired(claim, now) && input.completedNodeIds.has(nodeId)) {
      issues.push({
        type: 'claimed-completed',
        severity: 'warning',
        nodeId,
        message: `Active claim by "${claim.owner}" on already-completed node`,
        detail: { owner: claim.owner },
      });
    }
  }
  return issues;
}

function detectPhantomCompletions(input: DetectorInput): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];
  for (const nodeId of input.completedNodeIds) {
    if (!input.dagNodeIds.has(nodeId)) {
      issues.push({
        type: 'phantom-completion',
        severity: 'error',
        nodeId,
        message: `Completion record for node not in DAG`,
      });
    }
  }
  return issues;
}

function detectMissingArtifacts(input: DetectorInput): CorruptionIssue[] {
  const issues: CorruptionIssue[] = [];
  for (const nodeId of input.completedNodeIds) {
    const produces = input.nodeProduces[nodeId];
    if (!produces) continue;
    for (const path of produces) {
      if (!input.artifactExists(path)) {
        issues.push({
          type: 'missing-artifact',
          severity: 'error',
          nodeId,
          message: `Completed node missing produced artifact: ${path}`,
          detail: { path },
        });
      }
    }
  }
  return issues;
}

// -- Main entry --

export function detectCorruption(input: DetectorInput): CorruptionReport {
  const issues = [
    ...detectOrphanedClaims(input),
    ...detectStaleLocks(input),
    ...detectClaimedCompleted(input),
    ...detectPhantomCompletions(input),
    ...detectMissingArtifacts(input),
  ];

  return {
    issues,
    scanned: {
      nodes: input.dagNodeIds.size,
      claims: Object.keys(input.claims).length,
      completions: input.completedNodeIds.size,
    },
    clean: issues.length === 0,
  };
}
