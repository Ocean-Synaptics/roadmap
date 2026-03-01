// @module receipt-first/breakglass
// @exports BreakglassReceipt, openBreakglass, closeBreakglass, loadBreakglass, activeBreakglass, isBreakglassActive
// @types BreakglassReceipt, BreakglassScope
// @entry roadmap

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BreakglassScope {
  commands: string[];
  invariantsBypassed: string[];
}

export interface BreakglassReceipt {
  schema_version: 1;
  type: 'breakglass';
  id: string;
  openedAt: string;
  closedAt?: string;
  expiresAt: string;
  scope: BreakglassScope;
  reason: string;
  evidence: string;
  requiredFollowups: string[];
  status: 'open' | 'closed' | 'expired';
}

// ── Paths ────────────────────────────────────────────────────────────────────

const BG_DIR = (repoRoot: string) => join(repoRoot, '.roadmap', 'receipts', 'breakglass');

function bgPath(repoRoot: string, id: string): string {
  return join(BG_DIR(repoRoot), `${id}.json`);
}

function ensureDir(repoRoot: string): void {
  const dir = BG_DIR(repoRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function openBreakglass(
  repoRoot: string,
  opts: {
    reason: string;
    evidence: string;
    scope: BreakglassScope;
    ttlMinutes: number;
    requiredFollowups?: string[];
  },
): BreakglassReceipt {
  if (!opts.reason) throw new Error('Breakglass requires a reason');
  if (!opts.scope.commands.length) throw new Error('Breakglass scope must name at least one command');
  if (opts.ttlMinutes <= 0) throw new Error('Breakglass TTL must be positive');

  const now = new Date();
  const id = `bg-${now.toISOString().replace(/[:.]/g, '-')}`;
  const expiresAt = new Date(now.getTime() + opts.ttlMinutes * 60_000).toISOString();

  const receipt: BreakglassReceipt = {
    schema_version: 1,
    type: 'breakglass',
    id,
    openedAt: now.toISOString(),
    expiresAt,
    scope: opts.scope,
    reason: opts.reason,
    evidence: opts.evidence,
    requiredFollowups: opts.requiredFollowups ?? [],
    status: 'open',
  };

  ensureDir(repoRoot);
  writeFileSync(bgPath(repoRoot, id), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export function closeBreakglass(repoRoot: string, id: string): BreakglassReceipt {
  const receipt = loadBreakglass(repoRoot, id);
  if (!receipt) throw new Error(`Breakglass receipt not found: ${id}`);
  if (receipt.status === 'closed') throw new Error(`Breakglass already closed: ${id}`);

  receipt.closedAt = new Date().toISOString();
  receipt.status = 'closed';

  writeFileSync(bgPath(repoRoot, id), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

export function loadBreakglass(repoRoot: string, id: string): BreakglassReceipt | null {
  const path = bgPath(repoRoot, id);
  if (!existsSync(path)) return null;
  const receipt = JSON.parse(readFileSync(path, 'utf-8')) as BreakglassReceipt;

  // Auto-expire on read
  if (receipt.status === 'open' && new Date(receipt.expiresAt) < new Date()) {
    receipt.status = 'expired';
    writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
  }
  return receipt;
}

/**
 * Find all active (open, non-expired) breakglass receipts.
 */
export function activeBreakglass(repoRoot: string): BreakglassReceipt[] {
  const dir = BG_DIR(repoRoot);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const active: BreakglassReceipt[] = [];

  for (const file of files) {
    const receipt = loadBreakglass(repoRoot, file.replace('.json', ''));
    if (receipt && receipt.status === 'open') active.push(receipt);
  }
  return active;
}

/**
 * Check if a specific command is covered by an active breakglass.
 */
export function isBreakglassActive(repoRoot: string, command: string): BreakglassReceipt | null {
  const receipts = activeBreakglass(repoRoot);
  return receipts.find(r => r.scope.commands.includes(command)) ?? null;
}
