# Spec-Kit Workflow

Spec-kit is a spec-driven development toolkit that turns high-level intent into structured specifications, implementation plans, and importable task DAGs. The `/speckit.*` slash commands drive a pipeline that terminates in `roadmap import`, bridging natural-language requirements to DAG-governed execution.

## Pipeline

```
/speckit.constitution → /speckit.specify → /speckit.plan → /speckit.tasks → roadmap import --from speckit
```

Each stage reads the previous stage's output. The terminal artifact is a tasks file consumed by `roadmap import`.

## Workspace

Spec-kit artifacts live in `.roadmap/spec/`, scoped by DAG ID:

```
.roadmap/spec/
  fr-auth-001-pre-spec.md      # raw requirements
  fr-auth-001-spec.md          # structured specification
  fr-auth-001-plan.md          # implementation plan
  fr-auth-001-tasks.md         # importable task list
  fr-auth-001-constitution.md  # governing principles (optional)
```

See [SPEC-KIT-DIRECTORY.md](./SPEC-KIT-DIRECTORY.md) for naming conventions and migration from `.specify/`.

## Commands

### /speckit.constitution

Establish project governing principles: code quality standards, testing policy, UX constraints, performance requirements. Creates `<dag-id>-constitution.md`.

```
/speckit.constitution Code must have 90% branch coverage. No external CSS frameworks.
All API endpoints return JSON with consistent error envelope. Zero runtime dependencies
beyond the standard library where possible.
```

Optional but recommended for projects with non-trivial constraints. The constitution feeds into all downstream stages.

### /speckit.specify

Define *what* to build and *why*. Focus on scenarios and acceptance criteria, not technology. Creates `<dag-id>-spec.md` with user stories, functional requirements, and a review checklist.

```
/speckit.specify Build a CLI tool that watches a directory for markdown files,
validates frontmatter against a YAML schema, and reports errors to stderr.
Files without frontmatter are skipped. Schema is loaded from a .schema.yaml
in the watched directory. Exit code 0 if all files pass, 1 otherwise.
```

Output sections: user stories, acceptance scenarios (Given/When/Then), edge cases, constraints.

After running, use `/speckit.clarify` to surface ambiguities before planning.

### /speckit.plan

Provide technology choices and architectural decisions. Reads the spec and produces `<dag-id>-plan.md` with implementation phases, component decomposition, data models, and API contracts.

```
/speckit.plan Use Node.js with chokidar for file watching. Parse frontmatter
with gray-matter. Schema validation via ajv. Single binary via esbuild.
Target Node 20+.
```

Output includes: objective, scope, core artifacts, acceptance scenarios mapped to components, implementation sequence.

The plan is validated by `validateSpecKitPlan()` which checks for required sections: Objective, Scope, Core artifacts, Acceptance scenarios, Implementation.

### /speckit.tasks

Break the plan into importable DAG nodes. Creates `<dag-id>-tasks.md` (or JSON). No arguments required — reads the plan.

```
/speckit.tasks
```

Output: array of task nodes, each with `nodeId`, `description`, `produces`, `consumes`, `dependencies`, `validate`, `mode`. Tasks include `init` and `term` bookend nodes.

Validated by `validateSpecKitTasks()` which checks:
- Required fields on every node (`nodeId`, `description`, `produces`, `consumes`, `dependencies`, `validate`, `mode`)
- Node ID format: `^[a-zA-Z][a-zA-Z0-9_-]*$`
- No duplicate IDs
- All dependency references resolve to defined nodes
- Exactly one `init` and one `term` node
- Acyclicity (Kahn's algorithm)
- Mode is `execute` or `plan`

### roadmap import

Import the validated tasks into a roadmap DAG:

```bash
roadmap import --from speckit .roadmap/spec/fr-auth-001-tasks.md --id fr-auth-001
```

This creates `.roadmap/head.json` with the full DAG structure. After import:

```bash
roadmap propagate --dry-run    # inspect derived constraints
roadmap propagate              # commit propagated validators
roadmap orient --note "post-import — starting execution"
```

## Output Formats

| Stage | File | Format | Consumed by |
|-------|------|--------|-------------|
| constitution | `*-constitution.md` | Markdown | specify, plan |
| specify | `*-spec.md` | Markdown (Given/When/Then scenarios) | plan, spec-conformance validators |
| plan | `*-plan.md` | Markdown (sections: Objective, Scope, Core artifacts, Acceptance scenarios, Implementation) | tasks |
| tasks | `*-tasks.md` | JSON array of `TaskNode` objects | `roadmap import` |

### TaskNode schema

```json
{
  "nodeId": "setup-watcher",
  "description": "Initialize chokidar watcher with configurable glob patterns",
  "produces": ["src/watcher.ts"],
  "consumes": [],
  "dependencies": ["init"],
  "validate": [{ "type": "artifact-exists", "target": ["src/watcher.ts"] }],
  "mode": "execute"
}
```

## Error Recovery

### Plan validation fails

```
Error: Missing required section: "Acceptance scenarios"
```

The plan must contain headings for: Objective, Scope, Core artifacts, Acceptance scenarios, Implementation. Re-run `/speckit.plan` or manually add the missing section.

### Tasks validation fails

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot read tasks file` | Wrong path or file not generated | Run `/speckit.tasks` first |
| `Invalid JSON` | Malformed output | Re-run `/speckit.tasks`; check for truncation |
| `Missing required field "nodeId"` | Incomplete task node | Edit the tasks file, add the field |
| `dependency "X" not found` | Typo or missing node | Fix the dependency reference or add the missing node |
| `No "init" node defined` | Bookend nodes missing | Ensure tasks include `init` (no deps) and `term` (depends on all leaves) |
| `Dependency cycle detected` | Circular dep chain | Trace the cycle from the error message, break it |

### Import fails

- **Validation gate**: `roadmap import` runs `validateSpecKitTasks()` before importing. Fix validation errors first.
- **Duplicate DAG ID**: A DAG with this ID already exists. Use a different `--id` or remove the existing DAG.
- **Position stale after import**: Run `roadmap orient --note "re-check"` to refresh.

### Stale position

```bash
roadmap orient --note "position check"   # always trust orient, never infer
```

## Examples

### Example 1: CLI tool from scratch

```bash
# 1. Initialize workspace
mkdir -p .roadmap/spec

# 2. Run the pipeline
/speckit.constitution Strict TypeScript, no any. 100% of public API tested.
/speckit.specify Build a markdown linter that checks heading hierarchy...
/speckit.clarify       # surface ambiguities
/speckit.plan Use TypeScript, unified/remark for AST. Distribute as npm package.
/speckit.tasks

# 3. Validate before import
# validateSpecKitTasks() runs automatically on import

# 4. Import into roadmap
roadmap import --from speckit .roadmap/spec/fr-mdlint-001-tasks.md --id fr-mdlint-001
roadmap propagate
roadmap orient --note "post-import — ready to execute"
roadmap chart
```

### Example 2: Adding a feature to an existing project

```bash
# Spec-kit works incrementally — new DAG for each feature
/speckit.specify Add OAuth2 login flow with Google and GitHub providers.
Users see a provider picker on /login. Callback handles token exchange.
Session stored in httpOnly cookie with 24h expiry.

/speckit.plan Express backend, passport.js for OAuth. React frontend with
react-router. Session via express-session + Redis store.

/speckit.tasks

roadmap import --from speckit .roadmap/spec/fr-oauth-001-tasks.md --id fr-oauth-001
roadmap propagate
roadmap orient --note "oauth feature — starting L01"
```

### Example 3: Agent brief generation

After import, generate a brief for an agent worker:

```typescript
import { generateAgentBrief } from 'roadmap/spec-kit';
import { orient, fileExists } from 'roadmap/protocol';
import { loadDAG } from 'roadmap/versioning';

const g = loadDAG('.roadmap/head.json');
const pos = orient(g, fileExists('.'));

const brief = generateAgentBrief({
  dagId: 'fr-oauth-001',
  intent: 'Implement passport.js OAuth strategies for Google and GitHub',
  orientation: pos,
  specKitWorkspace: '.roadmap/spec/',
});

// brief.markdown contains YAML frontmatter + position + produces/consumes + workflow commands
```

The brief includes: YAML frontmatter with batch position, spec file inventory, next-step commands, and troubleshooting tips. See `src/spec-kit/agent-brief.ts` for the full renderer.

## Tips

- **Write concrete intents.** `/speckit.specify` with vague input produces vague specs. Include quantities, boundaries, error conditions, and user-visible behavior. "Handle errors" is useless; "return 400 with `{ error: string }` body when input fails schema validation" is actionable.
- **Run `/speckit.clarify` before `/speckit.plan`.** Clarification surfaces assumptions that become expensive to fix after planning.
- **Check the plan before generating tasks.** Validate that the plan's acceptance scenarios cover every spec scenario. Unmapped scenarios become gaps in the DAG.
- **Validate incrementally.** Run `validateSpecKitPlan()` and `validateSpecKitTasks()` programmatically before `roadmap import` to catch structural issues early.
- **One DAG per feature.** Don't overload a single DAG with multiple unrelated features. Scope each spec-kit pipeline to one coherent unit of work.
- **Iterate on specs, not tasks.** If the task breakdown doesn't look right, go back to `/speckit.plan` or `/speckit.specify` and refine — don't hand-edit the tasks file.
