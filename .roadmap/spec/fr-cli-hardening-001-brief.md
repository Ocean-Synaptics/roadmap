---
dagId: "fr-cli-hardening-001"
level: 8
position: []
batchComplete: true
done: 17
remaining: 0
produces: []
consumes: []
specKitWorkspace: "/home/griffin/src/roadmap/.roadmap/spec"
---

# Agent Brief: fr-cli-hardening-001

## Intent

Harden CLI integration surface: exit codes, JSON output validation, concurrent state handling, metaflow instrumentation

## Position

- **Batch (L8):** 
- **Batch complete:** true
- **Remaining nodes:** 0

## Spec Files

- `/home/griffin/src/roadmap/.roadmap/spec/fr-cli-hardening-001-spec.md`

## Next Steps

1. Read spec files in `/home/griffin/src/roadmap/.roadmap/spec`
2. Run `/speckit.specify` — generate specification from pre-spec
3. Run `/speckit.plan` — produce implementation plan
4. Run `/speckit.tasks` — emit task DAG nodes
5. Run `roadmap import --from speckit <tasks.json> --id fr-cli-hardening-001` — import into roadmap

## Troubleshooting

- **Missing spec files:** Ensure `/home/griffin/src/roadmap/.roadmap/spec` exists and contains `pre-spec.md`
- **Validation failures:** Run `roadmap validate --note "checking"` to see which rules fail
- **Import errors:** Validate tasks JSON with `validateSpecKitTasks()` before importing
- **Position stale:** Re-run `roadmap orient --note "re-check"` to refresh batch position
