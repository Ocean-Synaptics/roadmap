// @module render/layout
// @exports resolveWidth, wrapText, truncate, padEnd
// @entry roadmap

export function resolveWidth(ttyWidth?: number): number {
  return Math.min(ttyWidth ?? 120, 140);
}

export function wrapText(s: string, width: number): string[] {
  if (s.length <= width) return [s];
  const words = s.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > width) { lines.push(line); line = w; }
    else { line = line ? `${line} ${w}` : w; }
  }
  if (line) lines.push(line);
  return lines;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

export function padEnd(s: string, n: number): string {
  return s.padEnd(n).slice(0, n);
}
