#!/usr/bin/env node
// @module scripts/leak-scan
// Read .roadmap/leak-patterns.local.json (gitignored) and scan tracked files for unallowlisted hits.
// Usage: node scripts/leak-scan.js [path...]   (default: git ls-files output)
// Exit 0 on clean, exit 1 with LEAK lines on dirty.
// Writes a structured receipt to .roadmap/round-2/v-leak-sweep.json when run with --receipt.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';

const SIDECAR_PATH = '.roadmap/leak-patterns.local.json';

function loadSidecar() {
  if (!existsSync(SIDECAR_PATH)) {
    console.error(`leak-scan: missing sidecar at ${SIDECAR_PATH}`);
    console.error('  this scanner fails closed when the sidecar is absent.');
    console.error('  on a maintainer machine, restore the file from a backup or rebuild it.');
    process.exit(1);
  }
  const raw = readFileSync(SIDECAR_PATH, 'utf-8');
  const data = JSON.parse(raw);
  return {
    blocked: [...(data.blocked_anywhere ?? []), ...(data.blocked_paths ?? [])],
    allowedByPath: data.allowed_terms_by_path ?? {},
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(patterns) {
  return new RegExp(patterns.map(escapeRegex).join('|'), 'gi');
}

function isAllowed(file, term, allowedByPath) {
  const globs = allowedByPath[term];
  if (!Array.isArray(globs)) return false;
  return globs.some((g) => {
    // glob → regex: ** matches any path segments incl /, * matches non-/ chars
    const re = new RegExp('^' + escapeRegex(g)
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*') + '$');
    return re.test(file);
  });
}

function listInputs(args) {
  const explicit = args.filter((a) => !a.startsWith('-'));
  if (explicit.length > 0) return explicit;
  const out = execSync('git ls-files', { encoding: 'utf-8' });
  return out.split('\n').filter((l) => l.trim());
}

function scan(files, sidecar) {
  const hits = [];
  const blockedRegex = buildRegex(sidecar.blocked);
  for (const file of files) {
    if (!existsSync(file)) continue;
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      blockedRegex.lastIndex = 0;
      let match;
      while ((match = blockedRegex.exec(lines[i])) !== null) {
        const term = match[0].toLowerCase();
        // try the matched term against per-path allowlist (case-insensitive lookup)
        const allowKey = Object.keys(sidecar.allowedByPath).find(
          (k) => k.toLowerCase() === term,
        );
        if (allowKey && isAllowed(file, allowKey, sidecar.allowedByPath)) continue;
        hits.push({ file, line: i + 1, term: match[0] });
      }
    }
  }
  return hits;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/leak-scan.js [path...] [--receipt]');
    console.log('  reads .roadmap/leak-patterns.local.json (gitignored)');
    console.log('  exits 0 on clean · exits 1 with LEAK lines on dirty');
    process.exit(0);
  }
  const writeReceipt = args.includes('--receipt');
  const sidecar = loadSidecar();
  const files = listInputs(args.filter((a) => a !== '--receipt'));
  const hits = scan(files, sidecar);

  for (const h of hits) {
    console.error(`LEAK: ${h.file}:${h.line} :: ${h.term}`);
  }

  if (writeReceipt) {
    const receiptPath = '.roadmap/round-2/v-leak-sweep.json';
    mkdirSync(dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, JSON.stringify({
      node: 'v-leak-sweep',
      verdict: hits.length === 0 ? 'GREEN' : 'BLOCKED',
      artifacts: [receiptPath],
      scanned: files.length,
      unallowlisted_hits: hits.length,
      hits: hits.slice(0, 50),
      verify: { cmd: 'node scripts/leak-scan.js --receipt', exit: hits.length === 0 ? 0 : 1 },
    }, null, 2) + '\n');
  }

  process.exit(hits.length === 0 ? 0 : 1);
}

main();
