#!/usr/bin/env npx tsx
// Expansion: token-unify execute nodes.
// Parallel structure:
//   L00: tu-schema (foundation)
//   L01: tu-claims-migrate, tu-strategy-migrate, tu-cli-surface, tu-index-gc (all parallel)
//   L02: tu-tests (integration)

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

const children: Record<string, any> = {
  'tu-schema': {
    id: 'tu-schema',
    desc: 'BoundToken type + TokenStore — read/write tokens at .roadmap/tokens/<type>/<id>.json, append to index.ndjson',
    mode: 'execute',
    produces: ['src/lib/token-store.ts'],
    consumes: [],
    ambient: ['src/lib/claims.ts', 'src/lib/strategy/schema.ts'],
    deps: ['token-unify-plan'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/token-store.ts' },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
  'tu-claims-migrate': {
    id: 'tu-claims-migrate',
    desc: 'Migrate claims.ts to BoundToken — loadClaims reads .roadmap/tokens/claim/, shim migrates claims.json on first read',
    mode: 'execute',
    produces: ['src/lib/claims.ts'],
    consumes: ['src/lib/token-store.ts'],
    ambient: [],
    deps: ['tu-schema'],
    validate: [
      { type: 'shell', command: "grep -q 'tokens/claim' src/lib/claims.ts", expectExitCode: 0 },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
  'tu-strategy-migrate': {
    id: 'tu-strategy-migrate',
    desc: 'Delete hints.ts, update selectStrategy() to write BoundToken type=strategy, remove latch check from orient',
    mode: 'execute',
    produces: ['src/lib/strategy/active.ts', 'src/lib/strategy/select.ts'],
    consumes: ['src/lib/token-store.ts'],
    ambient: ['src/lib/strategy/hints.ts', 'bin/roadmap.ts'],
    deps: ['tu-schema'],
    validate: [
      { type: 'shell', command: '! test -f src/lib/strategy/hints.ts', expectExitCode: 0 },
      { type: 'shell', command: "grep -q 'BoundToken' src/lib/strategy/select.ts", expectExitCode: 0 },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
  'tu-cli-surface': {
    id: 'tu-cli-surface',
    desc: 'roadmap token issue/list/inspect/revoke/gc commands. roadmap claim wired as shorthand to token issue --type claim',
    mode: 'execute',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/token-store.ts'],
    ambient: [],
    deps: ['tu-schema'],
    validate: [
      { type: 'shell', command: "bin/roadmap token list 2>/dev/null | python3 -m json.tool > /dev/null", expectExitCode: 0 },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
  'tu-index-gc': {
    id: 'tu-index-gc',
    desc: 'Token index writer (append to index.ndjson on issue) and gc pruner (delete expired + rewrite index)',
    mode: 'execute',
    produces: ['src/lib/token-index.ts'],
    consumes: ['src/lib/token-store.ts'],
    ambient: [],
    deps: ['tu-schema'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/token-index.ts' },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
  'tu-tests': {
    id: 'tu-tests',
    desc: 'Tests for S1-S7 — claim/strategy/gc/migration/latch-absent/backward-compat',
    mode: 'execute',
    produces: ['src/tests/token-unify.test.ts'],
    consumes: ['src/lib/token-store.ts', 'src/lib/claims.ts', 'src/lib/strategy/select.ts', 'src/lib/token-index.ts'],
    ambient: [],
    deps: ['tu-claims-migrate', 'tu-strategy-migrate', 'tu-cli-surface', 'tu-index-gc'],
    validate: [
      { type: 'artifact-exists', path: 'src/tests/token-unify.test.ts' },
      { type: 'shell', command: 'npx vitest run src/tests/token-unify.test.ts', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'token-unify-plan',
  },
};

for (const [id, node] of Object.entries(children)) {
  if (!graph.nodes[id]) graph.nodes[id] = node;
}

// Wire tu-tests into integration-terminal
const intTerm = graph.nodes['integration-terminal'];
if (intTerm && !intTerm.deps.includes('tu-tests')) {
  intTerm.deps.push('tu-tests');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log(`Expanded: ${Object.keys(children).length} token-unify nodes — 1 foundation + 4 parallel + 1 integration`);
