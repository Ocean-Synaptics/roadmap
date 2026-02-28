// @module render/style
// @exports STATUS_EMOJI, ANSI, ansiEnabled, styled, emoji
// @entry roadmap

import type { RenderOpts } from './types.ts';

export const STATUS_EMOJI: Record<string, string> = {
  done: '\u2705', current: '\uD83D\uDC49', blocked: '\u26D4', pending: '\u23F3', retired: '\u23ED\uFE0F', fail: '\u274C', plan: '\uD83D\uDFE6', pregate: '\uD83D\uDD0D'
};

export const ANSI = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
} as const;

export function ansiEnabled(opts: RenderOpts): boolean { return opts.color && opts.tty; }

export function styled(s: string, code: string, opts: RenderOpts): string {
  return ansiEnabled(opts) ? `${code}${s}${ANSI.reset}` : s;
}

export function emoji(e: string, opts: RenderOpts): string { return opts.emoji ? e : ''; }
