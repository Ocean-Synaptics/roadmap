// @module cli-human
// @exports renderOrient, renderChart, renderDoctor, renderValidate, renderTrail, renderRemaining, formatProgressBar, formatTable
// @entry roadmap/cli-human

// --- Shared helpers ---

export function formatProgressBar(filled: number, total: number, width = 30): string {
  if (total === 0) return '░'.repeat(width);
  const f = Math.round((filled / total) * width);
  return '█'.repeat(f) + '░'.repeat(width - f);
}

export function formatTable(headers: string[], rows: string[][], widths: number[]): string {
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const sep = widths.map(w => '-'.repeat(w)).join('-+-');
  const dataRows = rows.map(row => row.map((c, i) => c.padEnd(widths[i])).join(' | '));
  return [headerRow, sep, ...dataRows].join('\n');
}

function statusEmoji(pct: number): string {
  if (pct === 100) return '🏁';
  if (pct > 75) return '🔥';
  if (pct > 50) return '⚡';
  if (pct > 25) return '🚧';
  return '🌱';
}

// --- Orient ---

export interface OrientData {
  position: string[];
  level: number;
  done: number;
  remaining?: number;
  total?: number;
  produces?: readonly string[];
  consumes?: readonly string[];
  preGate?: string[];
  batchComplete?: boolean;
  batchRemaining?: string[];
  planNodes?: Set<string>;
}

export function renderOrient(d: OrientData): string {
  const lines: string[] = [];
  const batch = d.position?.length ? d.position.join(', ') : 'none';
  const total = d.total ?? (d.done + (d.remaining ?? 0));
  lines.push(`Position: [batch-${d.level}] ${batch}`);
  lines.push(`Progress: ${d.done}/${total} complete | Level ${d.level}`);
  if (d.produces?.length) lines.push(`Produces: ${d.produces.join(', ')}`);
  if (d.consumes?.length) lines.push(`Consumes: ${d.consumes.join(', ')}`);
  if (d.preGate?.length) {
    const planSet = d.planNodes ?? new Set<string>();
    const tags = d.preGate.map(n => planSet.has(n) ? `📋 ${n}` : `🔍 ${n}`);
    lines.push(`Pre-gate: ${tags.join(', ')}`);
  }
  return lines.join('\n');
}

// --- Chart ---

export interface ChartData {
  dag: { id: string; desc: string };
  done: number;
  total: number;
  batches: string[][];
  doneSet: Set<string>;
  currentBatch: string[];
  preGate: string[];
  retired: Set<string>;
  failed: Set<string>;
  planNodes: Set<string>;
  claims?: Map<string, { owner: string; claimExpiry: number }>;
  nodeDescs?: Map<string, string>;
  remaining?: string[];
}

export function renderChart(d: ChartData): string {
  const pct = d.total === 0 ? 0 : Math.round((d.done / d.total) * 100);
  const bar = formatProgressBar(d.done, d.total);
  const preGateSet = new Set(d.preGate);
  const currentSet = new Set(d.currentBatch);
  const now = Date.now();
  const lines: string[] = [];

  lines.push('');
  lines.push(`${statusEmoji(pct)} ${d.dag.id} — ${d.dag.desc}`);
  lines.push(`  ${bar} ${pct}% (${d.done}/${d.total} nodes)`);
  lines.push(`  📍 position: ${d.currentBatch.join(', ') || 'complete'}`);
  if (d.preGate.length) lines.push(`  🔍 ${d.preGate.length} plan node(s) available for pre-gate investigation`);
  lines.push(`  [✅ done]  [⏭️ skip]  [🟦 plan]  [❌ fail]  [⏳ pending]  [👉 current]  [🔍 pre-gate]`);
  lines.push('');

  for (let i = 0; i < d.batches.length; i++) {
    const batch = d.batches[i];
    const batchDone = batch.filter(n => d.doneSet.has(n)).length;
    const batchPct = batch.length === 0 ? 0 : Math.round((batchDone / batch.length) * 100);
    const bBar = formatProgressBar(batchDone, batch.length, 15);
    const levelEmoji = batchPct === 100 ? '✅' : batchDone > 0 ? '🔶' : '⬜';

    const nodeList = batch.map(n => {
      if (d.retired.has(n)) return `⏭️ ${n}`;
      if (d.doneSet.has(n)) return `✅ ${n}`;
      if (currentSet.has(n)) {
        let claimTag = '';
        if (d.claims) {
          const claim = d.claims.get(n);
          if (claim) {
            const secsLeft = Math.max(0, Math.floor((claim.claimExpiry - now) / 1000));
            if (secsLeft > 0) {
              const m = Math.floor(secsLeft / 60);
              const s = String(secsLeft % 60).padStart(2, '0');
              claimTag = ` [${claim.owner} ⏱${m}:${s}]`;
            } else {
              claimTag = ` [${claim.owner} ⌛expired]`;
            }
          }
        }
        return `👉 ${n}${claimTag}`;
      }
      if (d.failed.has(n)) return `❌ ${n}`;
      if (preGateSet.has(n)) return `🔍 ${n}`;
      if (d.planNodes.has(n)) return `🟦 ${n}`;
      return `⏳ ${n}`;
    }).join('  ');

    lines.push(`  ${levelEmoji} L${String(i).padStart(2, '0')} ${bBar} ${String(batchPct).padStart(3)}%  ${nodeList}`);
  }

  lines.push('');
  if (pct === 100) {
    lines.push('  🎉 ROADMAP COMPLETE');
  } else if (d.remaining && d.remaining.length > 0) {
    const next = d.remaining[0];
    const desc = d.nodeDescs?.get(next) ?? '';
    lines.push(`  ➡️  Next: ${next}${desc ? ` — ${desc}` : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

// --- Doctor ---

export interface DoctorData {
  dagId: string;
  nodeCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  planCount: number;
  skippedCount: number;
  staleCount: number;
  issues: string[];
}

export function renderDoctor(d: DoctorData): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  Completion diagnostics for ${d.dagId}:`);
  lines.push('');
  lines.push(`  Nodes:     ${d.nodeCount}`);
  lines.push(`  Completed: ${d.completedCount}`);
  lines.push(`  Failed:    ${d.failedCount}`);
  lines.push(`  Pending:   ${d.pendingCount}`);
  lines.push(`  Plan:      ${d.planCount}`);
  lines.push(`  Skipped:   ${d.skippedCount}`);
  lines.push(`  Stale:     ${d.staleCount}`);

  if (d.issues.length > 0) {
    lines.push('');
    lines.push('  Issues:');
    for (const issue of d.issues) lines.push(`    ⚠️  ${issue}`);
  } else {
    lines.push('');
    lines.push('  ✅ No issues found.');
  }
  lines.push('');
  return lines.join('\n');
}

// --- Validate ---

export interface ValidateCheckData {
  ruleType: string;
  target?: string;
  passed: boolean;
  evidence?: string;
}

export interface ValidateNodeData {
  nodeId: string;
  passed: boolean;
  checks: ValidateCheckData[];
  failedReason?: string;
}

export interface ValidateData {
  results: ValidateNodeData[];
  summary?: { total: number; passed: number; failed: number };
}

export function renderValidate(d: ValidateData): string {
  const lines: string[] = [];
  for (const r of d.results) {
    const icon = r.passed ? '✅' : '❌';
    lines.push(`${icon} ${r.nodeId}`);
    for (const c of r.checks) {
      const ci = c.passed ? '  ✅' : '  ❌';
      const target = c.target ? ` [${c.target}]` : '';
      lines.push(`${ci} ${c.ruleType}${target}${c.evidence ? ` — ${c.evidence}` : ''}`);
    }
    if (r.failedReason) lines.push(`  ⚠️  ${r.failedReason}`);
  }
  if (d.summary) {
    lines.push('');
    lines.push(`${d.summary.failed === 0 ? '✅' : '❌'} ${d.summary.passed}/${d.summary.total} passed`);
  }
  return lines.join('\n');
}

// --- Trail ---

export interface TrailEntryData {
  ts: string;
  cmd: string;
  note?: string;
  repo?: string;
  position?: string | string[];
  level?: number;
  dagId?: string;
}

export interface TrailData {
  entries: TrailEntryData[];
  count: number;
  source?: string;
}

export function renderTrail(d: TrailData): string {
  if (d.entries.length === 0) return 'No trail entries.';

  const lines: string[] = [];
  if (d.source) lines.push(`Source: ${d.source} (${d.count} total)`);
  lines.push('');

  for (const e of d.entries) {
    const pos = Array.isArray(e.position) ? e.position.join(', ') : (e.position ?? '');
    const ts = e.ts.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    const lvl = e.level !== undefined ? ` L${e.level}` : '';
    const repo = e.repo ? `[${e.repo}]` : '';
    lines.push(`${ts} ${repo} ${e.cmd}${lvl}${pos ? ` @ ${pos}` : ''}`);
    if (e.note) lines.push(`  ${e.note}`);
  }
  return lines.join('\n');
}

// --- Remaining ---

export interface RemainingNodeData {
  id: string;
  mode: string;
  blockedBy: string;
  state: string;
}

export interface RemainingData {
  remaining: RemainingNodeData[];
  count: number;
}

export function renderRemaining(d: RemainingData): string {
  if (d.remaining.length === 0) return 'No remaining nodes.';

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${d.count} remaining node(s):`);
  lines.push('');
  for (const r of d.remaining) {
    const stateTag = r.state === 'failed' ? '❌' : '⏳';
    const modeTag = r.mode === 'plan' ? ' [plan]' : '';
    lines.push(`  ${stateTag} ${r.id}${modeTag}  ← ${r.blockedBy}`);
  }
  lines.push('');
  return lines.join('\n');
}
