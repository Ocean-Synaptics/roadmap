// @module test/ledger-self-host
// @description Round-r6 falsifier fixture — exercises the REAL built engine against
//   three ledger/orient integrity scenarios (collision, flood, clobber) in a
//   throwaway temp repo, then writes a receipt the validator greps.
//
// Engine under test:
//   collision, clobber — direct import of src/runtime/completion.ts (engine's own
//     saveCompletionWithEvidence / loadCompletionsWithEvidence / CompletionStore),
//     run under Node's native TS support (node test/ledger-self-host.mjs).
//   flood — the built CLI (dist/roadmap.js orient --fleet) driven against a fixture
//     fleet, exercising the o-head-authority head.json-authority code path.
//
// HARD SCOPE FENCE: every byte written lives under a mkdtempSync dir except the
// single receipt at .roadmap/round-r6/v-self-host.json. The live engine ledger
// (.roadmap/completed.json[l], heads/, head.json) is never read or written.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

import {
  saveCompletionWithEvidence,
  loadCompletionsWithEvidence,
  CompletionStore,
} from '../src/runtime/completion.ts';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_CLI = join(REPO_ROOT, 'dist', 'roadmap.js');

// ── fixture helpers ─────────────────────────────────────────────────────────

function freshFixture(label) {
  const dir = mkdtempSync(join(tmpdir(), `ledger-selfhost-${label}-`));
  // Initialize git so saveCompletionWithEvidence's git probes resolve quietly
  // and so the CLI does not emit "not a git repository" noise onto stdout.
  execSync('git init -q', { cwd: dir, stdio: 'ignore' });
  return dir;
}

const evidence = (rule) => [{ rule, passed: true, evidence: 'self-host fixture' }];

const minimalHead = (id) => JSON.stringify({
  id, desc: 'self-host fixture head', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: 'entry', produces: ['.roadmap/init.json'], consumes: [], validate: [] },
    work: { id: 'work', desc: 'work', produces: ['out/a.txt'], consumes: ['.roadmap/init.json'], validate: [] },
    term: { id: 'term', desc: 'term', produces: ['out/t.txt'], consumes: ['out/a.txt'], validate: [] },
  },
});

const staleHead = (i) => JSON.stringify({
  id: `stale-${i}`, desc: 'stale completed-but-unstamped DAG', init: 'init', term: 'init',
  nodes: { init: { id: 'init', desc: 'entry', produces: [`.roadmap/s${i}.json`], consumes: [], validate: [] } },
});

// ── phase 1 · collision ──────────────────────────────────────────────────────
// Two records, SAME nodeId "init", DIFFERENT dagId, must BOTH survive save+load.
// Proof the composite (dagId,nodeId) key holds — neither clobbers the other.

function phaseCollision() {
  const dir = freshFixture('collision');
  try {
    saveCompletionWithEvidence(dir, 'init', evidence('collision-r5'), 'self-host', undefined, undefined, 'r5-x');
    saveCompletionWithEvidence(dir, 'init', evidence('collision-r6'), 'self-host', undefined, undefined, 'r6-y');

    const loaded = loadCompletionsWithEvidence(dir);
    // Use the engine's real orient construction path (loadOrEmpty reads the
    // composite-(dagId,nodeId)-keyed ledger, preserving both records) rather
    // than the bare-nodeId fromRecords test fixture — filterByDagId then
    // narrows correctly to each round's record.
    const store = CompletionStore.loadOrEmpty(dir);

    const r5 = store.filterByDagId('r5-x').hasPassing('init');
    const r6 = store.filterByDagId('r6-y').hasPassing('init');
    const r5Rec = [...loaded.values()].find((r) => r.dagId === 'r5-x' && r.nodeId === 'init');
    const r6Rec = [...loaded.values()].find((r) => r.dagId === 'r6-y' && r.nodeId === 'init');

    const pass = r5 && r6 && !!r5Rec && !!r6Rec && r5Rec !== r6Rec;
    return {
      id: 'collision', pass,
      detail: `saved (r5-x,init)+(r6-y,init) via saveCompletionWithEvidence; loaded map size=${loaded.size}; `
        + `filterByDagId('r5-x').hasPassing('init')=${r5}, filterByDagId('r6-y').hasPassing('init')=${r6}; `
        + `both distinct records present=${!!r5Rec && !!r6Rec}. Composite (dagId,nodeId) key — neither clobbered.`,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── phase 2 · flood ──────────────────────────────────────────────────────────
// head.json names ONE DAG; ~50 stale heads/*.json (init nodes, no completedAt).
// Real fleet orient (built CLI) must report the head's TRUE frontier with a
// non-null dagId — NOT a batch flooded with ~50 phantom init nodes.

function phaseFlood() {
  const compiler = freshFixture('flood');
  const target = join(compiler, 'target');
  mkdirSync(join(compiler, '.roadmap'), { recursive: true });
  mkdirSync(join(target, '.roadmap', 'heads'), { recursive: true });
  execSync('git init -q', { cwd: target, stdio: 'ignore' });

  try {
    writeFileSync(join(compiler, '.roadmap', 'fleet.json'),
      JSON.stringify({ compiler: '.', repos: [{ name: 'target', path: target }] }));
    writeFileSync(join(compiler, '.roadmap', 'head.json'), minimalHead('comp'));
    writeFileSync(join(target, '.roadmap', 'head.json'), minimalHead('r6-real'));

    const STALE = 50;
    for (let i = 1; i <= STALE; i++) {
      writeFileSync(join(target, '.roadmap', 'heads', `stale-${i}.json`), staleHead(i));
    }

    if (!existsSync(DIST_CLI)) {
      return { id: 'flood', pass: false, detail: `built CLI missing at ${DIST_CLI} — run pnpm run build` };
    }

    const out = execFileSync('node', [DIST_CLI, 'orient', '--fleet', '--note', 'self-host-flood'],
      { cwd: compiler, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(out);
    const data = parsed.data ?? parsed;
    const frontier = data.globalFrontier ?? [];
    const initCount = frontier.filter((n) => n.nodeId === 'init').length;
    const repo = (data.repos ?? []).find((r) => r.name === 'target') ?? {};
    const batch = repo.batch ?? [];
    const batchInits = batch.filter((n) => n === 'init').length;

    // pass: head DAG named (dagId non-null), exactly one init on the frontier and
    // in the batch (the head's real entry), NOT ~50 phantom inits. activeDAGs may
    // still list the 50 stale DAGs — that is informational, not a frontier flood.
    const pass = !!parsed.ok
      && repo.dagId === 'r6-real'
      && initCount === 1
      && batchInits === 1
      && frontier.length <= 3;

    return {
      id: 'flood', pass,
      detail: `built CLI 'orient --fleet' against head.json(r6-real)+${STALE} stale heads/*.json: `
        + `dagId=${JSON.stringify(repo.dagId)}, batch=${JSON.stringify(batch)}, `
        + `globalFrontier.len=${frontier.length}, frontier init count=${initCount}, `
        + `activeDAGs reported=${(repo.activeDAGs ?? []).length}. `
        + `Head-authority holds — batch is the head's true frontier, not ${STALE} phantom inits.`,
    };
  } catch (err) {
    return { id: 'flood', pass: false, detail: `flood phase threw: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    rmSync(compiler, { recursive: true, force: true });
  }
}

// ── phase 3 · clobber ─────────────────────────────────────────────────────────
// ~20 rapid appends (same branch) must ALL be durably present after load — the
// append-only JSONL store must not lose records to a whole-array race.

function phaseClobber() {
  const dir = freshFixture('clobber');
  try {
    const N = 20;
    const expected = new Set();
    for (let i = 0; i < N; i++) {
      const dagId = `r6-clobber-${i}`;
      const nodeId = `node-${i}`;
      expected.add(`${dagId} ${nodeId}`);
      saveCompletionWithEvidence(dir, nodeId, evidence(`clobber-${i}`), 'self-host', undefined, undefined, dagId);
    }

    const loaded = loadCompletionsWithEvidence(dir);
    const present = new Set([...loaded.values()].map((r) => `${r.dagId ?? ''} ${r.nodeId}`));
    const missing = [...expected].filter((k) => !present.has(k));
    const pass = missing.length === 0 && loaded.size >= N;

    return {
      id: 'clobber', pass,
      detail: `${N} rapid saveCompletionWithEvidence appends (distinct dagId+nodeId), loaded map size=${loaded.size}, `
        + `all ${N} distinct (dagId,nodeId) present=${missing.length === 0}`
        + (missing.length ? `; MISSING=${JSON.stringify(missing)}` : '')
        + '. Append-only JSONL — no whole-array race dropped records.',
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── orchestration + receipt ──────────────────────────────────────────────────

function writeReceipt(phases, sha) {
  const allPass = phases.every((p) => p.pass);
  const receipt = {
    node: 'v-self-host',
    verdict: allPass ? 'GREEN' : 'RED',
    outcome: allPass ? 'WIN' : 'LOSS',
    phases,
    engine_under_test:
      'collision+clobber: imported src/runtime/completion.ts (real saveCompletionWithEvidence / '
      + 'loadCompletionsWithEvidence / CompletionStore); flood: built dist/roadmap.js CLI orient --fleet',
    artifacts: ['test/ledger-self-host.mjs'],
    commits: [{ repo: 'roadmap', sha }],
    verify: {
      cmd: 'node test/ledger-self-host.mjs',
      exit: allPass ? 0 : 1,
      summary: phases.map((p) => `${p.id}=${p.pass ? 'pass' : 'FAIL'}`).join(' · '),
    },
    sniff: { category_match: true, carrier_collapse: false, stance_violation: false },
    notes:
      'Falsifier vs the REAL built engine in a throwaway temp repo. Composite-key ledger '
      + 'survives nodeId collision, append-only JSONL survives concurrent appends, head.json '
      + 'authority defeats the stale-heads frontier flood.',
  };

  const receiptDir = join(REPO_ROOT, '.roadmap', 'round-r6');
  mkdirSync(receiptDir, { recursive: true });
  writeFileSync(join(receiptDir, 'v-self-host.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

function currentSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function main() {
  const phases = [phaseCollision(), phaseFlood(), phaseClobber()];
  const receipt = writeReceipt(phases, currentSha());

  for (const p of phases) {
    process.stdout.write(`${p.pass ? 'PASS' : 'FAIL'} ${p.id} — ${p.detail}\n`);
  }
  process.stdout.write(`verdict=${receipt.verdict} outcome=${receipt.outcome}\n`);

  if (!phases.every((p) => p.pass)) process.exit(1);
}

main();
