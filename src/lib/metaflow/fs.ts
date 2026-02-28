// @module metaflow
// @exports runDir, renderDir, plainPath, ansiPath, ensureRunDir, readMeta, writeMeta, appendReceipt, readReceipts, readSessions, writeSessions
// @entry roadmap/metaflow

import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RunId, StepId, RunMeta, InteractionReceipt, SessionsStore } from './types.ts';

const MF_BASE = (base: string) => join(base, '.roadmap', 'metaflow', 'runs');

export function runDir(runId: RunId, base = process.cwd()): string {
  return join(MF_BASE(base), runId);
}

export function renderDir(runId: RunId, base = process.cwd()): string {
  return join(runDir(runId, base), 'render');
}

export function plainPath(runId: RunId, stepId: StepId, base = process.cwd()): string {
  return join(renderDir(runId, base), `${stepId}.plain.txt`);
}

export function ansiPath(runId: RunId, stepId: StepId, base = process.cwd()): string {
  return join(renderDir(runId, base), `${stepId}.ansi.txt`);
}

export function ensureRunDir(runId: RunId, base = process.cwd()): void {
  mkdirSync(renderDir(runId, base), { recursive: true });
}

export function readMeta(runId: RunId, base = process.cwd()): RunMeta {
  const p = join(runDir(runId, base), 'meta.json');
  return JSON.parse(readFileSync(p, 'utf8')) as RunMeta;
}

export function writeMeta(runId: RunId, meta: RunMeta, base = process.cwd()): void {
  writeFileSync(join(runDir(runId, base), 'meta.json'), JSON.stringify(meta, null, 2));
}

export function appendReceipt(runId: RunId, receipt: InteractionReceipt, base = process.cwd()): void {
  appendFileSync(join(runDir(runId, base), 'interactions.ndjson'), JSON.stringify(receipt) + '\n');
}

export function readReceipts(runId: RunId, base = process.cwd()): InteractionReceipt[] {
  const p = join(runDir(runId, base), 'interactions.ndjson');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as InteractionReceipt);
}

export function readSessions(runId: RunId, base = process.cwd()): SessionsStore {
  const p = join(runDir(runId, base), 'sessions.json');
  if (!existsSync(p)) return { schema_version: 1, teamId: runId, sessions: [] };
  return JSON.parse(readFileSync(p, 'utf8')) as SessionsStore;
}

export function writeSessions(runId: RunId, store: SessionsStore, base = process.cwd()): void {
  writeFileSync(join(runDir(runId, base), 'sessions.json'), JSON.stringify(store, null, 2));
}
