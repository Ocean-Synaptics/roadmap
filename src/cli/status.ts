// @module cli/status
// @description Status command: batch position + per-node artifact/receipt status.
// @exports run

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CompletionStore } from '../runtime/completion.ts';
import { crossOrientWithState, loadDAG, json } from './shared.ts';
import type { OutputOpts } from '../lib/cli-envelope.ts';

export async function run(
  args: string[],
  repoRoot: string,
  hasLocalDAG: boolean,
  outputOpts: OutputOpts,
): Promise<void> {
  if (!hasLocalDAG) {
    json({ error: 'No roadmap tracked in this repo', fix: 'Run `roadmap make <spec.json>`' }, outputOpts);
    return;
  }

  const dag = await loadDAG(repoRoot);
  const completion = CompletionStore.loadOrEmpty(repoRoot);
  const pos = await crossOrientWithState(dag, repoRoot);

  const batchNodeIds = pos.position || [];
  const nodeMap = new Map(
    Object.entries(dag.nodes).map(([id, node]) => [id, node as any]),
  );

  const status = batchNodeIds
    .map(nodeId => {
      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const produces = (node.produces as string[]) || [];
      const producesExist = produces.map(p => ({
        file: p,
        exists: existsSync(join(repoRoot, p)),
      }));

      const hasReceipt = completion.hasPassing(nodeId);
      const validators = ((node.validate as any) || []).length;

      return { nodeId, produces, producesExist, hasReceipt, validators };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  json({
    batch: batchNodeIds,
    nodes: status,
    batchComplete: pos.batchComplete,
    level: pos.level,
  }, outputOpts);
}
