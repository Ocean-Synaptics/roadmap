// @module render/bars
// @exports progressBar, progressLine
// @entry roadmap

const FILLED = '\u2588';
const EMPTY = '\u2591';

export function progressBar(cur: number, total: number, width = 30): string {
  if (total === 0) return EMPTY.repeat(width);
  const f = Math.round((cur / total) * width);
  return FILLED.repeat(f) + EMPTY.repeat(width - f);
}

export function progressLine(label: string, cur: number, total: number, barWidth = 20): string {
  const pct = total === 0 ? 0 : Math.round((cur / total) * 100);
  return `${label}: [${progressBar(cur, total, barWidth)}] ${cur}/${total} (${pct}%)`;
}
