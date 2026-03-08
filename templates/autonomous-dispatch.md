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
- If `detectedGaps` is empty: the work is complete. Do not fabricate a successor.

### Chain continuation

After writing the successor spec, you need to be on main to run `roadmap make`.
If you are on a feature branch:

1. `git checkout main && git merge <your-branch>`
2. `roadmap make successor-spec.json --note "chain from <dag_id> iteration <N>"`
3. `roadmap orient` — begin the next cycle

This is the autonomous loop: work DAG → term → successor spec → merge → make → orient → work DAG.
Do not stop at "merge this branch first." Complete the loop.

## Permissions

Next moves approved. Do not ask permission. Merge to main approved. Dispatch parallel background sonnet agents for independent batch nodes. Expand plan nodes into subgraphs as you encounter them.
