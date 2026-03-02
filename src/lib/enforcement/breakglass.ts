// @module enforcement
// @exports activateBreakglass, deactivateBreakglass, isBreakglassActive, getBreakglassLog
// @types BreakglassToken, BreakglassLog
// @entry roadmap

import { writeToken, listTokens, tokenId } from '../utils/tokens/token-store.ts';
import type { BoundToken } from '../utils/tokens/token-store.ts';

export interface BreakglassToken {
  tokenId: string;
  activatedAt: string;
  reason: string;
  restrictions: string[];
}

export interface BreakglassLog {
  activated: boolean;
  activatedAt?: string;
  activatedBy?: string;
  reason?: string;
  restrictions?: string[];
}

/**
 * Breakglass mechanism: emergency bypass for enforcement restrictions
 */
export function activateBreakglass(root: string, reason: string, restrictions: string[]): void {
  const now = new Date().toISOString();
  const token: BoundToken = {
    schema_version: 1,
    tokenId: tokenId('breakglass', 'activate', now),
    type: 'breakglass',
    subject: 'emergency-mode',
    issuedAt: now,
    boundTo: { headSha: '' },
    payload: {
      reason,
      restrictions,
      activatedAt: now,
    },
    ok: true,
  };
  writeToken(root, token);
}

export function deactivateBreakglass(root: string): void {
  const now = new Date().toISOString();
  const token: BoundToken = {
    schema_version: 1,
    tokenId: tokenId('breakglass', 'deactivate', now),
    type: 'breakglass',
    subject: 'emergency-mode',
    issuedAt: now,
    boundTo: { headSha: '' },
    payload: { deactivatedAt: now },
    ok: false,
  };
  writeToken(root, token);
}

export function isBreakglassActive(root: string): boolean {
  const tokens = listTokens(root, 'breakglass');
  const active = tokens.filter(t => t.ok).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  return active.length > 0;
}

export function getBreakglassLog(root: string): BreakglassLog {
  const tokens = listTokens(root, 'breakglass');
  const active = tokens.filter(t => t.ok).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  if (active.length === 0) return { activated: false };
  const t = active[0];
  return {
    activated: true,
    activatedAt: t.payload.activatedAt as string,
    reason: t.payload.reason as string,
    restrictions: t.payload.restrictions as string[],
  };
}
