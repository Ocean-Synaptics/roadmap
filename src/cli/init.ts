// @module cli/init
// @description Print setup instructions for adapting roadmap to the user's environment.
// @exports run

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { emit, type OutputOpts } from '../lib/cli-envelope.ts';

function findSetupDoc(): string {
  const here = dirname(new URL(import.meta.url).pathname);
  const candidates = [
    join(here, '..', '..', 'docs', 'SETUP.md'),
    join(here, '..', 'docs', 'SETUP.md'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return '';
}

export async function run(
  _args: string[],
  _repoRoot: string,
  _note: string,
  outputOpts: OutputOpts,
): Promise<void> {
  const doc = findSetupDoc();
  if (doc) {
    console.log(readFileSync(doc, 'utf-8'));
  } else {
    console.log('See https://github.com/Ocean-Synaptics/roadmap/blob/main/docs/SETUP.md');
    console.log('Paste the prompt from the "TL;DR for Claude Code users" section into your agent.');
  }
  emit({ ok: true, cmd: outputOpts.cmd, data: { printed: !!doc } }, outputOpts);
}
