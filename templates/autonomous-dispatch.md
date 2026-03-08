Execute the current roadmap autonomously.

## Protocol

1. `roadmap orient` — position is truth. Never infer.
2. Work every node in the current batch. Parallel background agents when batch has 2+ nodes.
3. Per node: implement produces → `git add <produces>` → `git commit "<node-id>: <what>"` → `roadmap advance <node-id>`
4. When advance rejects: read the error, fix the produce, re-commit, retry. Never skip validators.
5. When batch completes: orient again, work the next batch. Repeat until done.

## At terminal node

The brief includes `terminalContext` with completion evidence, detected gaps, and chain history.
Do NOT make a new roadmap from scratch. Instead:

- Read `terminalContext.detectedGaps` — these are the remaining work items
- Read `terminalContext.rootIntent` — this is what we're still building toward
- Write a successor spec scoped to the gaps, with the same `dag_id` suffixed by iteration
- `roadmap make successor-spec.json` — this continues the chain, not restarts it
- If `detectedGaps` is empty: the work is complete. Do not fabricate a successor.

## Permissions

Next moves approved. Do not ask permission. Dispatch parallel background sonnet agents for independent batch nodes. Expand plan nodes into subgraphs as you encounter them.
