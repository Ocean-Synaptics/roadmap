# Adopter Quickstart: Roadmap + Git

Get a project under roadmap governance in 5 minutes.

## Installation

```bash
npm install roadmap
# Hooks automatically installed ✓
```

## Bootstrap (one-time)

```bash
roadmap integrate --auto
```

This creates:
- `.roadmap.json` — metadata (project type, build command, dependencies)
- `.roadmap/head.json` — initial DAG (bootstrap → build → test → release)
- `.git/hooks/pre-commit` — enforces orientation before commits
- `.git/hooks/post-commit` — records state for recovery

## Typical Workflow

### Day 1: Start a Phase

```bash
# Find where you are
roadmap orient --note "implementing auth module"
roadmap chart

# See output:
# position: "implement-auth"
# produces: ["src/auth.ts", "tests/auth.test.ts"]
# consumes: ["src/core.ts"]
# remaining: ["test-auth", "docs", "release"]
```

### Work Within the Phase

```bash
# Make changes, multiple commits are fine
git commit -m "implement-auth: add JWT parsing"
git commit -m "implement-auth: add refresh tokens"
git commit -m "implement-auth: add session storage"
# ✅ All allowed (within 12 hours of orientation)
```

### Complete the Phase

```bash
# Verify completion
ls src/auth.ts tests/auth.test.ts
# ✓ artifacts exist

# Reorient (finds you're now in "test-auth")
roadmap orient --note "auth implementation complete"
roadmap chart

# See progress updated
# position: "test-auth"
# done: 7/15
```

### Archive at Boundaries

```bash
# Periodic: group related work
roadmap trail --archive
# Creates: commit "roadmap: archive trail (8 entries)"
```

## Key Rules

✅ **DO:**
- `roadmap orient` before starting work
- Commit as many times as you want within a phase
- `roadmap orient` again when phase is done
- `roadmap trail --archive` at logical boundaries

❌ **DON'T:**
- Commit without orienting (hook prevents it after 12h)
- Skip phases (DAG enforces order)
- Manually edit `.roadmap/head.json` (let roadmap manage it)

## Multi-Project Setup

```bash
# Project A (depends on B)
# A/.roadmap.json
{
  "dependencies": [
    {
      "repo": "../b",
      "consumes": ["dist/"],
      "phase": "build"
    }
  ]
}

# Cross-repo progress
roadmap chart --deps
```

## Next Steps

- Read `docs/ADOPTION-GUIDE.md` — detailed patterns
- Read `docs/GIT-INTEGRATION.md` — hook mechanics
- Check `example/` — real-world DAGs
- Run `roadmap help` — full CLI reference

## FAQ

**Q: Can I commit without orienting?**
A: No (after 12 hours). The hook prevents position drift.

**Q: Do all commits need to be phase boundaries?**
A: No. Commit as often as you want within a phase. Boundaries are when you `roadmap orient` again.

**Q: What if the hook is wrong?**
A: `git commit --no-verify` bypasses it (use carefully).

**Q: How do I recover if something breaks?**
A: Use checkpoints: `roadmap checkpoint --label "before-risky-change"` then `roadmap restore --label "before-risky-change"`.

**Q: Can I see progress visually?**
A: Yes: `roadmap chart` shows progress bar, completion %, next steps.

## Enforcement (Why It Works)

```
Hook system enforces: "Know where you are before you commit"
  ↓
Orientation required before work starts
  ↓
Git commits show progress within phase
  ↓
Reorientation confirms phase completion
  ↓
Trail archive creates checkpoint commits
  ↓
Result: Roadmap and Git are isomorphic (always in sync)
```

## Support

- **Bug reports:** GitHub issues
- **Questions:** Check `docs/` first
- **Customization:** Hooks are in `.git/hooks/pre-commit` (edit to taste)

---

**You're all set!** Your repo now has enforced roadmap governance. Start with:

```bash
roadmap orient --note "project start"
roadmap chart
```
