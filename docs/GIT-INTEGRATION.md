# Git Integration: Bidirectional Roadmap

Roadmap + Git are **isomorphic**: progress in one reflects in the other.

## Design: Forward & Backward Casting

**Forward casting (roadmap → git):**
- Roadmap shows what needs to be done next
- Orientation finds your position
- Commits happen as you work through the phase

**Backward casting (git → roadmap):**
- Git history shows what was built
- Artifact existence (from git) proves phase completion
- Recover state via `gitArtifactAt(commit)`

## The Core Rule

**You must know where you are before you commit.**

```
Orient (find position)
  ↓
Work & commit (multiple commits allowed in phase)
  ↓
Orient again (when phase done)
  ↓
Archive trail (optional, at phase boundaries)
```

## Git Hooks (Automatic)

### Pre-commit: Enforce Orientation
Blocks commits if:
- No orientation in the last 12 hours (position may have changed)

Warns (non-blocking) if:
- Commit message doesn't mention the node
- Trail is accumulating without archival

```bash
$ git commit -m "fix: bug in build"
⚠️  Commit message should reference node: build-process-discoverer
✅ Pre-commit checks passed (warning only)
[master abc123] fix: bug in build
```

### Post-commit: Record State
After each commit:
- Records git commit hash
- Records which artifacts exist
- Enables recovery via `gitArtifactAt(commit, path)`

## Installation

**Automatic (on npm install):**
```bash
npm install roadmap
# Hooks installed automatically via postinstall script
```

**Manual:**
```bash
npx roadmap install-hooks
```

**During bootstrap:**
```bash
roadmap integrate --auto
# Hooks installed as part of integration
```

## In-Between Commits

You can commit multiple times within a phase:

```
Position: build
  ↓ (work, commit)
Commit 1: "build: initial setup"
  ↓ (work, commit)
Commit 2: "build: add TypeScript compilation"
  ↓ (work, commit)
Commit 3: "build: add source maps"
  ↓ (orient: still in build, or moved to test)
```

All three commits are valid as long as you've oriented once before starting.

## Trail Archival

Trail can grow large over time. Archive at phase boundaries:

```bash
roadmap orient --note "phase complete"
# Do work, multiple commits...
roadmap trail --archive
# Trail is now committed to git
git log --oneline
# Shows: "roadmap: archive trail (N entries)"
```

## For Adopters

When you install roadmap:

1. **Hooks are automatic** — no configuration needed
2. **Discipline is soft** — enforce orientation, allow flexibility within phases
3. **Bidirectionality is guaranteed** — git + roadmap always in sync

### Workflow

```bash
# Start session
roadmap orient --note "implementing feature X"

# Work and commit (as many as you want)
git commit -m "feature-x-impl: add parsing"
git commit -m "feature-x-impl: add tests"
git commit -m "feature-x-impl: add docs"

# Done with phase
roadmap orient --note "feature X complete"

# Move to next phase
roadmap chart  # see progress

# Archive trail at logical boundaries
roadmap trail --archive
git log --oneline | head -5
# Shows your work + trail archive commit
```

## Hook Customization

Hooks are in `hooks/*.ts`. Customize or disable:

```bash
# Disable pre-commit (not recommended)
rm .git/hooks/pre-commit

# Or temporarily bypass (use with care)
git commit --no-verify
```

## Advanced: Custom Predicates

Use git state for predicates:

```typescript
import { gitArtifactAt } from 'roadmap/predicates';

const g = define(myDAG);
const predicate = gitArtifactAt(cwd(), 'v0.5.0');
const pos = orient(g, predicate);
// Position based on v0.5.0 tag, not current working tree
```

## See Also

- `.git/hooks/pre-commit` — enforcement logic
- `.git/hooks/post-commit` — state recording
- `bin/install-hooks.ts` — hook installer
- `docs/AUDIT.md` — trail structure
- `predicates.ts` — `gitArtifactAt` implementation
