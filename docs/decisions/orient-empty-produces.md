# Orient Empty-Produces: Gate Node Advancement

## Problem

The `orient()` function in `src/protocol.ts` determines which node a session has reached in a DAG based on filesystem state. It walks the topological order and returns the first node whose artifacts are not all present.

Two types of nodes exist:
- **Work nodes**: `produces: [artifacts]` — filesystem state must be checked
- **Gate nodes**: `produces: []` — no artifacts to create, purely coordinating

A gate node with no artifacts to produce is **trivially done** — there is nothing for the session to do. Once its dependencies are satisfied, orient() must advance past it.

### Bug

Early implementations used:

```typescript
if (node.produces.length && node.produces.every(exists)) {
  // mark node as done
}
```

This short-circuits to `false` when `produces.length === 0`, preventing gate nodes from ever being marked done. orient() would stall permanently at any gate in the forward path.

Example: `init (produces:['seed']) → gate (produces:[]) → term`
- With 'seed' existing, init is done
- gate should be trivially done (no artifacts to create)
- But the short-circuit prevents advancement
- orient() returns position='gate' and stalls, never reaching term

## Solution

The logic must be inverted to account for trivial completion:

```typescript
if (!node.produces.length || node.produces.every(exists)) {
  // mark node as done
}
```

This reads: "A node is done if it produces nothing (trivially done) **or** all its produces exist (work complete)."

## Validation

Property-based tests in `tests/adv-orient.test.ts` verify:

1. **Advances past non-terminal gate** — init → gate (produces:[]) → term with 'seed' existing advances to term.

2. **Gate in done, not remaining** — once advanced past, the gate appears in `done[]`, not `remaining[]`.

3. **Chain of gates** — multiple consecutive gates (init → gate-1 → gate-2 → term) all traversed to term.

4. **Gate at init** — init with produces:[] advances immediately to the next work node.

5. **Gate after stall** — work node stalls at position, downstream gate does not advance until work completes.

6. **Gate advances when upstream work completes** — same graph, but when work artifact appears, gate advances to term.

7. **Regression: work nodes still stall** — non-empty produces behavior unchanged; nodes stall when artifacts missing.

8. **Regression: work advances when complete** — nodes with produces advance when all files exist.

## Impact

- **Correct**: Gate nodes (produces:[]) now properly advance, enabling sequential coordination between batches.
- **Scoped**: Only affects `orient()` return value; does not impact reconcile(), merge(), or other DAG operations.
- **Backward compatible**: Work nodes unchanged; gate advancement is a bug fix, not a breaking change.
- **Testable**: All 8 adversarial tests pass; 7 boundary tests guard regressions.

## References

- `src/protocol.ts:279` — implementation
- `tests/adv-orient.test.ts` — adversarial spec and test suite
- `src/protocol.ts:263-293` — full `orient()` function
