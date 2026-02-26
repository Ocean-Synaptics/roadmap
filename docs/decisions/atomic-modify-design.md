# Atomic Modify Design

## Problem

DAG modifications must be atomic and durable:
- Add node + validate + commit in one operation
- Concurrent agents see consistent state
- Failed modifications don't leave partial state
- Git history tracks each modification

## Solution

Provide `modifyAndCommit()` operation:
1. Stage change in memory (addNode/removeNode/updateNode)
2. Validate result
3. Write to disk atomically
4. Commit to git with message

```typescript
await modifyAndCommit(g, {
  operation: 'add',
  node: { id: 'new', produces: [...], ... },
  message: 'Add new build step',
});
```

Result: one git commit per modification, concurrent agents safe via `git pull`.

## Design

### modifyAndCommit Signature

```typescript
async function modifyAndCommit<T extends string>(
  g: Graph<T>,
  change: ModifyChange<T>,
  options?: ModifyOptions,
): Promise<{
  graph: Graph<T>;
  commit: string;
  message: string;
}>;

type ModifyChange<T> =
  | { operation: 'add'; node: NodeSpec<T, T>; message: string }
  | { operation: 'remove'; nodeId: T; message: string }
  | { operation: 'update'; nodeId: T; updates: Partial<NodeSpec<T, T>>; message: string };

interface ModifyOptions {
  dryRun?: boolean;
  validate?: boolean;
  author?: { name: string; email: string };
}
```

### Flow

1. **Apply change**: call addNode/removeNode/updateNode
2. **Validate**: define(g2), verify(g2), check(g2)
3. **Write**: `.roadmap/head.json` updated atomically
4. **Commit**: git add + git commit with message
5. **Return**: new graph + commit hash

### Atomicity Guarantees

- **File write**: write to temp, then atomic rename
- **Git commit**: all changes in single commit
- **Rollback**: if commit fails, revert filesystem change

### Concurrency

Multiple agents can call modifyAndCommit concurrently:
1. Each writes to `.roadmap/head.json` (protected by git)
2. Later commits rebase on earlier commits
3. `git pull` fetches latest state before orient

Example:
```
Agent A: add 'test' node → commit abc123
Agent B: add 'build' node → commit (rebases on abc123)
Agent C: pull, orient with merged DAG
```

### Error Handling

- Validation fails → no write, no commit, error returned
- Write fails → rollback, error returned
- Commit fails → head.json rolled back, error returned

## Non-Goals

- Interactive conflict resolution (fail on conflict)
- Merge strategies (sequential commits only)
- Distributed consensus (single repo = source of truth)

## Rationale

**Why write then commit (not commit then write)?**
- Filesystem is source of truth until git succeeds
- Failure during git commit can't corrupt filesystem state
- Recovery is simpler (just delete partial commit)

**Why one change per commit?**
- Clear git history (each change is traceable)
- Easy rollback via `git revert`
- Prevents mixing unrelated changes

**Why validate before commit?**
- Prevents invalid DAGs from entering git history
- Easier to diagnose issues (git log shows valid states only)
- Concurrent agents don't need to validate on pull

## Integration

- `orient()` reads `.roadmap/head.json` after pull
- Session trail records git commit hashes
- Checkpoints record git refs for recovery
