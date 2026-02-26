// @module claims
// Per-node ownership for parallel batch execution.
// Store: .roadmap/claims.json (local to repo root).
// Claims are advisory — expired entries are ignored, not deleted on read.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface NodeClaim {
  owner: string;
  claimedAt: string;   // ISO 8601
  claimExpiry: string; // ISO 8601
}

export type ClaimStore = Record<string, NodeClaim>;

export function loadClaims(repoRoot: string): ClaimStore {
  const path = join(repoRoot, '.roadmap', 'claims.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ClaimStore;
  } catch {
    return {};
  }
}

export function saveClaims(repoRoot: string, store: ClaimStore): void {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'claims.json'), JSON.stringify(store, null, 2) + '\n');
}

export function isExpired(claim: NodeClaim, now = new Date()): boolean {
  return new Date(claim.claimExpiry) < now;
}

/** Returns only non-expired entries. Does not mutate the store. */
export function activeClaims(store: ClaimStore, now = new Date()): ClaimStore {
  const out: ClaimStore = {};
  for (const [id, c] of Object.entries(store)) {
    if (!isExpired(c, now)) out[id] = c;
  }
  return out;
}

export interface ClaimAnnotation extends NodeClaim {
  expired: boolean;
}

/** Annotate a set of node IDs with their claim status from the store. */
export function annotateWithClaims(
  nodeIds: readonly string[],
  store: ClaimStore,
  now = new Date(),
): Record<string, ClaimAnnotation> {
  const out: Record<string, ClaimAnnotation> = {};
  for (const id of nodeIds) {
    if (id in store) {
      out[id] = { ...store[id], expired: isExpired(store[id], now) };
    }
  }
  return out;
}
