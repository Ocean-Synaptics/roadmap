// @module render/box
// @exports boxPanel, boxTable
// @entry roadmap

import { padEnd } from './layout.ts';

export function boxPanel(title: string, body: string, width: number): string {
  const inner = width - 4; // │ + space + content + space + │
  const titleStr = title ? `[${title}]` : '';
  const topFill = Math.max(0, width - 2 - titleStr.length); // ┌ + titleStr + ─fill + ┐
  const top = `\u250C${titleStr}${ '\u2500'.repeat(topFill)}\u2510`;
  const bot = `\u2514${'\u2500'.repeat(width - 2)}\u2518`;

  const lines = body.split('\n');
  const bodyLines = lines.map(l => {
    const trimmed = l.slice(0, inner);
    return `\u2502 ${trimmed.padEnd(inner)} \u2502`;
  });

  return [top, ...bodyLines, bot].join('\n');
}

export function boxTable(headers: string[], rows: string[][], width: number): string {
  const colCount = headers.length;
  if (colCount === 0) return '';

  // Compute column widths: distribute evenly minus separators
  const separatorChars = (colCount - 1) * 3; // " │ " between columns
  const available = Math.max(width - separatorChars, colCount);
  const colWidth = Math.floor(available / colCount);
  const widths = headers.map((_, i) => i === colCount - 1 ? available - colWidth * (colCount - 1) : colWidth);

  const headerRow = headers.map((h, i) => padEnd(h, widths[i])).join(' \u2502 ');
  const sep = widths.map(w => '\u2500'.repeat(w)).join('\u2500\u253C\u2500');
  const dataRows = rows.map(row =>
    row.map((c, i) => padEnd(c ?? '', widths[i] ?? colWidth)).join(' \u2502 ')
  );

  return [headerRow, sep, ...dataRows].join('\n');
}
