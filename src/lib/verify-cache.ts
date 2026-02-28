// @module verify-cache
// @exports VerifyCache, loadCache, saveCache, getCached, setCached
// @types VerifyCache, CacheEntry
// @entry roadmap

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CacheEntry {
  nodeId: string;
  treeSha: string;
  passed: boolean;
  exitCode: number;
  stdout: string;
  cachedAt: string;
}

export interface VerifyCache {
  entries: CacheEntry[];
}

const CACHE_PATH = (repoRoot: string) => join(repoRoot, '.roadmap', 'verify-cache.json');

export function loadCache(repoRoot: string): VerifyCache {
  const path = CACHE_PATH(repoRoot);
  if (!existsSync(path)) return { entries: [] };
  return JSON.parse(readFileSync(path, 'utf-8')) as VerifyCache;
}

export function saveCache(cache: VerifyCache, repoRoot: string): void {
  writeFileSync(CACHE_PATH(repoRoot), JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

export function getCached(cache: VerifyCache, nodeId: string, treeSha: string): CacheEntry | undefined {
  return cache.entries.find(e => e.nodeId === nodeId && e.treeSha === treeSha);
}

export function setCached(cache: VerifyCache, entry: CacheEntry): void {
  const idx = cache.entries.findIndex(e => e.nodeId === entry.nodeId && e.treeSha === entry.treeSha);
  if (idx >= 0) cache.entries[idx] = entry;
  else cache.entries.push(entry);
}
