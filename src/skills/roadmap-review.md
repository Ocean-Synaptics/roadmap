<!-- roadmap-skill-version: TO_BE_FILLED -->
# /roadmap-review

Three-pass adversarial review of a proposed DAG. Run before committing any roadmap structure changes (`.roadmap/head.json`, batch definitions, phase transitions).

## Arguments
- `dag` (required): Path to the DAG file under review (typically `.roadmap/head.json`).
- `intent` (required): The stated intent from `orient --note` — what this DAG is supposed to accomplish.

## Steps

### Pass 1 — Assumption challenge (fool lens)

Identify what the DAG author assumed without stating. Concrete examples of what to look for:

1. **Unstated dependency**: Batch 2 node `electron-db` produces `electron/db.ts`. Batch 3 node `renderer-store` consumes it. But `electron-db` depends on `better-sqlite3` native bindings — if `electron-rebuild` is not in batch 1, the dependency is assumed but not encoded. Cite: `node: electron-db missing dep on native-rebuild`.
2. **Batch failure cascade**: Batch 2 has 3 parallel nodes. Batch 3 consumes outputs from all 3. What if `electron-db` fails but `renderer-store` and `config-theme` succeed? Does batch 3 make sense with 2/3 inputs? If not, the implicit assumption is "batch 2 is all-or-nothing" — which the DAG does not enforce. Cite: `edge: batch-2 → batch-3 assumes all-or-nothing completion`.
3. **Single point of failure**: One node produces a shared type file consumed by 5 downstream nodes. If that node's validation rejects, the entire DAG stalls. Is there a fallback? A manual-approval gate? Cite: `node: shared-types is SPOF for 5 downstream consumers`.
4. **Weakest link**: Which node has the vaguest acceptance criteria? Which node has `validate: []` (no validation at all)? That node will pass vacuously — any garbage output advances the DAG. Cite: `node: design-auth has validate: [] — passes with no evidence`.

### Pass 2 — Structural review (inquisitor lens)

Verify the DAG satisfies formal properties. Every finding must cite specific nodes and criteria.

1. **Acceptance criteria are testable and falsifiable.** A testable criterion has a concrete condition: `{ type: 'shell', command: 'vitest --coverage > 85%' }` or `{ type: 'build-produces', command: 'electron-vite build', outputs: ['dist/main.js'] }`. An unfalsifiable criterion: `"code is clean"` — no command can verify this. Cite each criterion and its status. Example: `node: compile-prompts criterion 'vitest --run tests/compile-prompts.test.ts' — testable. node: design-review criterion 'manual-approval' — not falsifiable without reviewer`.
2. **Dependencies are acyclic.** Trace the graph from init to term. If A depends on B and B depends on A, the DAG is invalid (`define()` would catch this, but review catches semantic cycles that type-check misses). Cite: `edge: phase-4 → phase-5 → phase-4 via shared produces`.
3. **Scope is bounded per batch.** Flag any batch containing a plan node with `{ type: 'expanded' }` validation where `minNodes` is unset — this means unbounded expansion. A batch with 3 plan nodes and no `minNodes` could expand into 30 nodes. Cite: `node: design-auth in batch 3 has expanded validation without minNodes — unbounded`.
4. **Every node has acceptance criteria; every edge has rationale.** A node with `validate: []` passes vacuously. A dependency edge without a corresponding `consumes` entry is a phantom dependency — it serializes execution without data flow justification. Cite: `node: setup-lint has validate: []. edge: setup-lint → electron-db has no corresponding consumes entry`.

### Pass 3 — Deviation check (griffinProxy lens)

Verify the DAG matches the user's stated intent — not more, not less.

1. **Intent match**: Compare the `orient --note` intent against the DAG's terminal node description and acceptance criteria. If the intent says "add JWT refresh token rotation" but the terminal node validates "full auth system with OAuth, SAML, and JWT", scope has crept. Cite: `intent: "JWT refresh rotation" vs term node: "full auth system" — scope mismatch`.
2. **Scope creep**: Count nodes. A 3-sentence intent should not produce a 40-node DAG. Each node should trace back to a phrase in the intent. Nodes that cannot be traced are candidates for removal. Cite: `node: monitoring-dashboard — not traceable to intent "add JWT refresh"`.
3. **Future-need nodes**: A node fails this test when its produces are not consumed by any other node in the DAG and its validation does not contribute to the terminal node's acceptance criteria. It exists "because we'll need it later." That is speculative — remove it or justify it with a concrete edge. Cite: `node: api-versioning produces api/v2/routes.ts — not consumed by any node, not in term validation`.
4. **User recognition**: Would the person who typed the `orient --note` look at this DAG and say "yes, that's what I asked for"? If the answer requires explanation, the DAG has drifted.

### Verdict

Synthesize the three passes into one of:
- **proceed**: all three passes clean. Write the DAG.
- **conditional**: risks noted but bounded. Write the DAG, record the risks as comments in `head.json`. Example: `// REVIEW: node shared-types is SPOF for 5 consumers — acceptable if node is trivial`.
- **reject**: structural problem or intent mismatch. Do not write. Reframe the problem with the user before continuing.

**Rejection example**: Pass 2 finds that the terminal node has `validate: []` — no acceptance criteria at all. The DAG can close without any behavioral validation. This is a structural problem. Verdict: **reject**. Evidence: `node: term has validate: [] — DAG closes vacuously. Fix: add at minimum a launch-check or intent gate on term`. The DAG is not written until this is resolved.

## Contract
- **All three passes run. No skipping.** Present all three inline, then synthesize the verdict.
- **Every finding must include evidence.** Use the format: `node: <id> <finding>` for node issues, `edge: <source> → <target> <finding>` for dependency issues, `intent: "<quoted text>" vs <dag element> — <mismatch>` for deviation findings. No finding without a referent.
- **Reject blocks the DAG commit.** If any pass produces a structural problem or intent mismatch, the DAG is not written. Reframe with the user.
- **This review runs before writing, not after.** Reviewing a committed DAG is an audit; this skill is a gate.
