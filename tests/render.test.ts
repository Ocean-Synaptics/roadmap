// Render layer unit tests — pure string functions, zero IO.
import { describe, it, expect } from 'vitest';
import { resolveWidth, wrapText, truncate, padEnd } from '../src/lib/render/layout.ts';
import { progressBar, progressLine } from '../src/lib/render/bars.ts';
import { boxPanel, boxTable } from '../src/lib/render/box.ts';
import { ansiEnabled, styled, emoji, STATUS_EMOJI, ANSI } from '../src/lib/render/style.ts';
import { renderDagLayers, renderCriticalPath } from '../src/lib/render/dag.ts';
import { renderErrorPanel } from '../src/lib/render/errors.ts';
import type { RenderOpts, DagLayer } from '../src/lib/render/types.ts';

// --- Opts factories ---

const plainOpts: RenderOpts = { tty: false, width: 80, color: false, emoji: false };
const colorOpts: RenderOpts = { tty: true, width: 80, color: true, emoji: true };
const emojiOnlyOpts: RenderOpts = { tty: false, width: 80, color: false, emoji: true };

// ============================================================
// layout.ts
// ============================================================

describe('resolveWidth', () => {
  it('defaults to 120 when no ttyWidth given', () => {
    expect(resolveWidth()).toBe(120);
  });

  it('uses ttyWidth when below 140', () => {
    expect(resolveWidth(100)).toBe(100);
  });

  it('caps at 140', () => {
    expect(resolveWidth(200)).toBe(140);
  });

  it('uses exact 140 boundary', () => {
    expect(resolveWidth(140)).toBe(140);
  });
});

describe('wrapText', () => {
  it('returns single line if text fits', () => {
    expect(wrapText('hello world', 80)).toEqual(['hello world']);
  });

  it('wraps long text at word boundaries', () => {
    const result = wrapText('aaa bbb ccc ddd', 8);
    expect(result.length).toBeGreaterThan(1);
    for (const line of result) {
      expect(line.length).toBeLessThanOrEqual(8);
    }
  });

  it('handles empty string', () => {
    expect(wrapText('', 80)).toEqual(['']);
  });

  it('handles single long word exceeding width', () => {
    // wrapText splits on spaces — a single word with no spaces ends up
    // as the sole non-empty entry (initial empty line is an artifact of
    // the "push current line, start new" logic when line === '').
    const result = wrapText('superlongword', 5);
    expect(result).toEqual(['', 'superlongword']);
  });

  it('wraps exactly at width boundary', () => {
    // "aaa bbb" = 7 chars, width=7 → fits on one line
    expect(wrapText('aaa bbb', 7)).toEqual(['aaa bbb']);
    // "aaa bbb c" = 9 chars, width=7 → wraps
    const result = wrapText('aaa bbb c', 7);
    expect(result.length).toBe(2);
  });
});

describe('truncate', () => {
  it('returns string unchanged when within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    const result = truncate('hello world', 6);
    expect(result.length).toBe(6);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('handles exact length', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });
});

describe('padEnd', () => {
  it('pads short string', () => {
    expect(padEnd('hi', 5)).toBe('hi   ');
  });

  it('truncates long string to n', () => {
    expect(padEnd('hello world', 5)).toBe('hello');
  });

  it('returns string unchanged at exact width', () => {
    expect(padEnd('abc', 3)).toBe('abc');
  });
});

// ============================================================
// bars.ts
// ============================================================

describe('progressBar', () => {
  it('shows all empty when total is 0', () => {
    const bar = progressBar(0, 0, 10);
    expect(bar.length).toBe(10);
    expect(bar).toBe('\u2591'.repeat(10));
  });

  it('shows all filled at 100%', () => {
    const bar = progressBar(5, 5, 10);
    expect(bar).toBe('\u2588'.repeat(10));
  });

  it('shows half filled at 50%', () => {
    const bar = progressBar(5, 10, 10);
    expect(bar).toBe('\u2588'.repeat(5) + '\u2591'.repeat(5));
  });

  it('respects custom width', () => {
    const bar = progressBar(1, 4, 8);
    expect(bar.length).toBe(8);
  });

  it('uses default width of 30', () => {
    const bar = progressBar(0, 1);
    expect(bar.length).toBe(30);
  });
});

describe('progressLine', () => {
  it('formats label, bar, count, and percentage', () => {
    const line = progressLine('test', 3, 10, 10);
    expect(line).toContain('test:');
    expect(line).toContain('3/10');
    expect(line).toContain('30%');
    expect(line).toContain('[');
    expect(line).toContain(']');
  });

  it('shows 0% when total is 0', () => {
    const line = progressLine('empty', 0, 0, 10);
    expect(line).toContain('0%');
    expect(line).toContain('0/0');
  });
});

// ============================================================
// box.ts
// ============================================================

describe('boxPanel', () => {
  it('wraps body in box with title', () => {
    const result = boxPanel('Title', 'hello', 40);
    expect(result).toContain('[Title]');
    expect(result).toContain('\u250C'); // top-left corner
    expect(result).toContain('\u2518'); // bottom-right corner
    expect(result).toContain('hello');
  });

  it('works without title', () => {
    const result = boxPanel('', 'content', 30);
    expect(result).toContain('\u250C');
    expect(result).not.toContain('[]');
  });

  it('handles multiline body', () => {
    const result = boxPanel('T', 'line1\nline2\nline3', 40);
    const lines = result.split('\n');
    // top + 3 body lines + bottom = 5
    expect(lines.length).toBe(5);
  });
});

describe('boxTable', () => {
  it('returns empty string for no headers', () => {
    expect(boxTable([], [], 80)).toBe('');
  });

  it('renders headers and rows', () => {
    const result = boxTable(['Name', 'Value'], [['a', '1'], ['b', '2']], 40);
    expect(result).toContain('Name');
    expect(result).toContain('Value');
    expect(result).toContain('a');
    expect(result).toContain('2');
    // separator row uses ─ and ┼
    expect(result).toContain('\u253C');
  });

  it('handles single column', () => {
    const result = boxTable(['Only'], [['row1'], ['row2']], 30);
    expect(result).toContain('Only');
    expect(result).toContain('row1');
    // No column separators with single column
    expect(result).not.toContain('\u253C');
  });
});

// ============================================================
// style.ts
// ============================================================

describe('ansiEnabled', () => {
  it('returns true when both color and tty are true', () => {
    expect(ansiEnabled(colorOpts)).toBe(true);
  });

  it('returns false when color is false', () => {
    expect(ansiEnabled(plainOpts)).toBe(false);
  });

  it('returns false when tty is false', () => {
    expect(ansiEnabled({ ...colorOpts, tty: false })).toBe(false);
  });
});

describe('styled', () => {
  it('wraps text with ANSI codes when enabled', () => {
    const result = styled('hello', ANSI.bold, colorOpts);
    expect(result).toBe(`${ANSI.bold}hello${ANSI.reset}`);
  });

  it('returns plain text when ANSI disabled', () => {
    expect(styled('hello', ANSI.bold, plainOpts)).toBe('hello');
  });
});

describe('emoji', () => {
  it('returns emoji when opts.emoji is true', () => {
    expect(emoji('✅', emojiOnlyOpts)).toBe('✅');
  });

  it('returns empty string when opts.emoji is false', () => {
    expect(emoji('✅', plainOpts)).toBe('');
  });
});

describe('STATUS_EMOJI', () => {
  it('has entries for all expected statuses', () => {
    const expected = ['done', 'current', 'blocked', 'pending', 'retired', 'fail', 'plan', 'pregate'];
    for (const key of expected) {
      expect(STATUS_EMOJI).toHaveProperty(key);
      expect(typeof STATUS_EMOJI[key]).toBe('string');
    }
  });
});

// ============================================================
// dag.ts
// ============================================================

describe('renderDagLayers', () => {
  const mkLayers = (nodes: Array<{ id: string; status: 'done' | 'current' | 'pending'; desc?: string }>, level = 0): DagLayer[] => [
    { level, nodes },
  ];

  it('includes progress header', () => {
    const result = renderDagLayers([], plainOpts, 10, 3);
    expect(result).toContain('3/10');
    expect(result).toContain('30%');
    expect(result).toContain('Progress:');
  });

  it('renders layer labels with zero-padded level', () => {
    const layers = mkLayers([{ id: 'a', status: 'done' }], 1);
    const result = renderDagLayers(layers, plainOpts, 1, 1);
    expect(result).toContain('L01');
  });

  it('sorts nodes by id within a layer', () => {
    const layers: DagLayer[] = [{ level: 0, nodes: [
      { id: 'zeta', status: 'pending' },
      { id: 'alpha', status: 'done' },
    ] }];
    const result = renderDagLayers(layers, plainOpts, 2, 0);
    const idx_a = result.indexOf('alpha');
    const idx_z = result.indexOf('zeta');
    expect(idx_a).toBeLessThan(idx_z);
  });

  it('includes node descriptions when present', () => {
    const layers = mkLayers([{ id: 'n1', status: 'done', desc: 'My description' }]);
    const result = renderDagLayers(layers, plainOpts, 1, 1);
    expect(result).toContain('My description');
  });

  it('truncates long descriptions', () => {
    const long = 'A'.repeat(60);
    const layers = mkLayers([{ id: 'n1', status: 'done', desc: long }]);
    const result = renderDagLayers(layers, plainOpts, 1, 1);
    // truncate(long, 40) → 39 chars + ellipsis
    expect(result).not.toContain(long);
    expect(result).toContain('\u2026');
  });

  it('shows emoji icons when emoji enabled', () => {
    const layers = mkLayers([{ id: 'n1', status: 'done' }]);
    const result = renderDagLayers(layers, emojiOnlyOpts, 1, 1);
    expect(result).toContain(STATUS_EMOJI.done);
  });

  it('omits emoji icons when emoji disabled', () => {
    const layers = mkLayers([{ id: 'n1', status: 'done' }]);
    const result = renderDagLayers(layers, plainOpts, 1, 1);
    expect(result).not.toContain(STATUS_EMOJI.done);
  });
});

describe('renderCriticalPath', () => {
  it('returns empty string for empty path', () => {
    expect(renderCriticalPath([], plainOpts)).toBe('');
  });

  it('joins nodes with arrows', () => {
    const result = renderCriticalPath(['a', 'b', 'c'], plainOpts);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('c');
    expect(result).toContain('\u2192'); // →
    expect(result).toContain('Critical Path:');
  });

  it('renders single node without arrows', () => {
    const result = renderCriticalPath(['only'], plainOpts);
    expect(result).toContain('only');
    expect(result).toContain('Critical Path:');
  });
});

// ============================================================
// errors.ts
// ============================================================

describe('renderErrorPanel', () => {
  it('renders error code in title', () => {
    const result = renderErrorPanel({ code: 'TEST_ERR', message: 'something broke' }, plainOpts);
    expect(result).toContain('TEST_ERR');
    expect(result).toContain('something broke');
  });

  it('renders fix steps when provided', () => {
    const result = renderErrorPanel({
      code: 'E001',
      message: 'failure',
      fix: ['step one', 'step two'],
    }, plainOpts);
    expect(result).toContain('Fix:');
    expect(result).toContain('step one');
    expect(result).toContain('step two');
    expect(result).toContain('\u2022'); // bullet
  });

  it('omits fix section when no fix steps', () => {
    const result = renderErrorPanel({ code: 'E002', message: 'oops' }, plainOpts);
    expect(result).not.toContain('Fix:');
  });

  it('wraps in box frame', () => {
    const result = renderErrorPanel({ code: 'E003', message: 'msg' }, plainOpts);
    expect(result).toContain('\u250C'); // ┌
    expect(result).toContain('\u2518'); // ┘
  });

  it('handles multiline error message', () => {
    const result = renderErrorPanel({ code: 'E004', message: 'line1\nline2' }, plainOpts);
    expect(result).toContain('line1');
    expect(result).toContain('line2');
  });
});

// ============================================================
// index.ts — render + renderNodes integration
// ============================================================

describe('render + renderNodes', () => {
  // Import the top-level render and renderNodes
  // They re-export from index.ts so we can import from there
  let render: typeof import('../src/lib/render/index.ts').render;
  let renderNodes: typeof import('../src/lib/render/index.ts').renderNodes;

  // Dynamic import to avoid naming collision
  it('render produces plain output with color:false', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const output = mod.render(
      { kind: 'generic', title: 'test', nodes: [{ t: 'text', s: 'hello' }] },
      { ...plainOpts },
    );
    expect(output.plain).toContain('hello');
    expect(output.ansi).toBeUndefined();
  });

  it('render produces ansi output when color:true', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const output = mod.render(
      { kind: 'generic', title: 'test', nodes: [{ t: 'h1', s: 'heading' }] },
      colorOpts,
    );
    expect(output.plain).toContain('heading');
    expect(output.ansi).toBeDefined();
    expect(output.ansi).toContain('heading');
  });

  it('renderNodes handles text node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'text', s: 'simple text' }], plainOpts);
    expect(lines).toContain('simple text');
  });

  it('renderNodes handles line node as empty string', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'line' }], plainOpts);
    expect(lines).toContain('');
  });

  it('renderNodes handles h1 node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'h1', s: 'Title' }], plainOpts);
    expect(lines).toContain('Title');
  });

  it('renderNodes handles h2 node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'h2', s: 'Subtitle' }], plainOpts);
    expect(lines).toContain('Subtitle');
  });

  it('renderNodes handles kv node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'kv', key: 'Name', value: 'val' }], plainOpts);
    expect(lines[0]).toContain('Name:');
    expect(lines[0]).toContain('val');
  });

  it('renderNodes handles list node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'list', items: ['a', 'b'] }], plainOpts);
    expect(lines).toContain('  - a');
    expect(lines).toContain('  - b');
  });

  it('renderNodes handles bar node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes([{ t: 'bar', label: 'progress', cur: 5, total: 10 }], plainOpts);
    expect(lines[0]).toContain('progress:');
    expect(lines[0]).toContain('50%');
  });

  it('renderNodes handles panel node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes(
      [{ t: 'panel', title: 'P', body: [{ t: 'text', s: 'inner' }] }],
      { ...plainOpts, width: 40 },
    );
    const joined = lines.join('\n');
    expect(joined).toContain('[P]');
    expect(joined).toContain('inner');
  });

  it('renderNodes handles table node', async () => {
    const mod = await import('../src/lib/render/index.ts');
    const lines = mod.renderNodes(
      [{ t: 'table', headers: ['H1', 'H2'], rows: [['a', 'b']] }],
      plainOpts,
    );
    const joined = lines.join('\n');
    expect(joined).toContain('H1');
    expect(joined).toContain('H2');
    expect(joined).toContain('a');
  });
});
