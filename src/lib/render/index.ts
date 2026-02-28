// @module render
// @exports render, renderNodes
// @types RenderModel, RenderOpts, RenderOutput, RenderNode, DagLayer
// @entry roadmap

import type { RenderModel, RenderOpts, RenderOutput, RenderNode } from './types.ts';
import { styled, emoji, STATUS_EMOJI, ANSI } from './style.ts';
import { wrapText, truncate, resolveWidth } from './layout.ts';
import { boxPanel, boxTable } from './box.ts';
import { progressBar, progressLine } from './bars.ts';

export { render, renderNodes };
export type { RenderModel, RenderOpts, RenderOutput, RenderNode };
export type { DagNode, DagLayer, RenderSection } from './types.ts';
export { STATUS_EMOJI, ANSI, ansiEnabled, styled, emoji } from './style.ts';
export { resolveWidth, wrapText, truncate, padEnd } from './layout.ts';
export { boxPanel, boxTable } from './box.ts';
export { progressBar, progressLine } from './bars.ts';

function render(model: RenderModel, opts: RenderOpts): RenderOutput {
  const plain = renderNodes(model.nodes, { ...opts, color: false }).join('\n');
  const ansi = opts.color ? renderNodes(model.nodes, opts).join('\n') : undefined;
  return { plain, ansi };
}

function renderNodes(nodes: RenderNode[], opts: RenderOpts): string[] {
  const width = resolveWidth(opts.width);
  const lines: string[] = [];

  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        for (const wl of wrapText(n.s, width)) lines.push(wl);
        break;
      case 'line':
        lines.push('');
        break;
      case 'h1':
        lines.push(styled(n.s, ANSI.bold, opts));
        break;
      case 'h2':
        lines.push(styled(n.s, ANSI.cyan, opts));
        break;
      case 'panel':
        lines.push(boxPanel(n.title, renderNodes(n.body, opts).join('\n'), width));
        break;
      case 'table':
        lines.push(boxTable(n.headers, n.rows, width));
        break;
      case 'bar':
        lines.push(progressLine(n.label, n.cur, n.total, n.width));
        break;
      case 'dagLayers':
        for (const layer of n.layers) {
          const nodeStrs = layer.nodes.map(dn => {
            const icon = emoji(STATUS_EMOJI[dn.status] ?? '', opts);
            const desc = dn.desc ? styled(` ${truncate(dn.desc, 40)}`, ANSI.dim, opts) : '';
            return `${icon}${icon ? ' ' : ''}${dn.id}${desc}`;
          });
          lines.push(styled(`L${String(layer.level).padStart(2, '0')}`, ANSI.gray, opts) + '  ' + nodeStrs.join('  '));
        }
        break;
      case 'kv':
        lines.push(`${styled(n.key + ':', ANSI.bold, opts)} ${n.value}`);
        break;
      case 'list':
        for (const item of n.items) lines.push(`  - ${item}`);
        break;
    }
  }

  return lines;
}
