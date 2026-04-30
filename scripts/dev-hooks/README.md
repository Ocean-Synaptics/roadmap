# dev-hooks · maintainer-only

These are the maintainer's local git hooks. They are NOT installed
automatically — contributors get no surprise hooks on `pnpm install`.

## Activation (maintainer)

```
git config core.hooksPath scripts/dev-hooks/
```

## Hooks
- pre-commit: typecheck + DAG structure check on main + branch guard
- commit-msg: requires node-id reference (gates itself on .roadmap/head.json)
- prepare-commit-msg: appends [batch: L<level>] trailer
- post-commit: no-op
- post-push: optional mirror-sync (set ROADMAP_PROD_CLONE / ROADMAP_DEV_CLONE)

## Why these aren't in .husky/

`husky` was dropped as a devDependency to keep `pnpm install` light
for contributors. The hooks are still useful to the maintainer; this
directory is the place they live.
