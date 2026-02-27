# Fixup: Full workflow integration — skills, paths, and feature wiring

**Target**: Agent maintaining ~/src/roadmap
**Priority**: Blocking for iter3 of any payload project
**Supersedes**: FIXUP-INSTALL-SKILLS-PATH.md (absorbed into this fixup)

This fixup covers everything needed to make the shipped features (v0.7.0) actually usable end-to-end in a project workflow. Three categories: structural fixes, missing skills, and feature wiring.

---

## 1. Structural: Skill directory format

### Problem
`roadmap install --skills` writes flat files to `.claude/commands/`. The Skill tool expects `.claude/skills/<name>/SKILL.md`. Installed skills are invisible to the Skill tool — agents must manually read files instead of calling `Skill(skill: "roadmap-start")`.

### Fix

```
Current (broken):
  .claude/commands/roadmap-start.md
  .claude/commands/roadmap-work.md
  ...

Correct:
  .claude/skills/roadmap-start/SKILL.md
  .claude/skills/roadmap-work/SKILL.md
  ...
```

**Files to change:**

`src/lib/install-skills.ts`:
- `SkillTemplate.write()` — create subdirectory, write SKILL.md inside it
- `installAll()` — default targetDir from `.claude/commands` to `.claude/skills`
- `installAll()` — add cleanup: remove stale `roadmap-*.md` from `.claude/commands/` (only roadmap- prefixed, don't touch speckit or other commands)
- Constraints skill: same pattern — `.claude/skills/roadmap-constraints/SKILL.md`

`bin/roadmap.ts`:
- `cmdInstall()` — update output messages to say `.claude/skills`

Tests:
- Update all path assertions

---

## 2. Missing skills: builtinTemplates() is incomplete

### Problem
`builtinTemplates()` registers 7 skills. `src/skills/` has 8 template files (explore-write and explore-run exist as .md but aren't in builtinTemplates). FR-SKILL-CATALOG defines 14 agent skills total. The install command only installs 7 + constraints.

### What must be in builtinTemplates()

**Already registered (7):** start, work, done, dispatch, review, gallery, progress

**Template .md exists but not registered (2):**
- `explore-write` — read `src/skills/roadmap-explore-write.md`, add to builtinTemplates
- `explore-run` — read `src/skills/roadmap-explore-run.md`, add to builtinTemplates

**Need new templates (6):**

#### `/roadmap-expand`
```
Steps:
1. Run: orient --check → verify node is in current batch
2. Run: show <node> → get failing intents if expanding from intent failure
3. Generate expansion script from failing intents (or accept user-provided script path)
4. Run: expand <script> --note "$reason"
5. Run: propagate → back-derive constraints on new nodes
6. Run: orient --check → confirm DAG reopened at new nodes
7. Return: new node IDs, their produces, their batch level

Contract:
- Always propagate after expand. No exceptions.
- Expansion script is deterministic — same failures → same fix nodes.
- If expanding from intent failure: fix nodes inherit parent's deterministic gates.
```

#### `/roadmap-validate`
```
Steps:
1. Run: validate <node> [--evaluate '$evaluate'] --note "pre-check"
2. Parse ValidationResult
3. Return: deterministic checks, intent checks, allPassed, expandable (any failing intent has expandOnFail?)

Contract:
- Read-only. Does not modify DAG state, does not complete, does not commit.
- Use before /roadmap-done to catch failures early.
```

#### `/roadmap-claim`
```
Steps:
1. Run: claim <node> --owner $owner --ttl $ttl
2. Run: show <node> → return full node spec
3. Run: orient --check → confirm position

Contract:
- Claims are advisory locks. If claim fails (already claimed): return current owner + expiry. Do not retry.
```

#### `/roadmap-escalate`
```
Steps:
1. Run: show <node> → get node context
2. Run: orient --check → get current position
3. Compose structured escalation: { node, type, reason, currentConfidence, attemptCount, produces, evidence }
4. If in swarm: SendMessage to orchestrator
5. If single agent: AskUserQuestion with "Provide hint", "Skip (retire)", "Override (--skip-validate)", "Pause"

Contract:
- Never escalate without evidence. No finding without a referent.
```

#### `/roadmap-trail`
```
Steps:
- archive: Run trail --archive → commit local trail
- read: Run trail [--global] [--last N] → return entries
- status: Run trail --last 1 → return most recent breadcrumb

Contract:
- Always archive at session end.
```

#### `/roadmap-checkpoint`
```
Steps:
- save: Run checkpoint --label "$label" --note "$reason"
- list: Run checkpoint --list
- restore: Run checkpoint --restore (confirm with user first — destructive)

Contract:
- Checkpoint before expansion and risky architectural changes.
```

### Implementation
For each of the 6 new skills: create `src/skills/roadmap-<name>.md` template file AND add a `new SkillTemplate(...)` entry to `builtinTemplates()` in `install-skills.ts`.

For the 2 existing templates (explore-write, explore-run): add `new SkillTemplate(...)` entries to `builtinTemplates()` that read from the existing .md files, or inline the content.

Total after fix: **15 skills** installed by `roadmap install --skills` (14 agent + constraints).

---

## 3. Feature wiring: shipped features that aren't connected

### 3a. Visual intent evaluation path

**Status**: `IntentRule.explore` field exists. `launchApp()`, `runExploreScript()`, observation helpers all exist. But `validateNode()` in protocol.ts does NOT run explore scripts when processing intent rules with `explore` field.

**What to wire:**

In `validateNode()` (protocol.ts), when processing an intent rule:
```typescript
} else if (rule.type === 'intent') {
  // NEW: if rule.explore is set, run explore script first
  if (rule.explore && opts?.runExplore) {
    const handle = await launchApp({ command: opts.launchCommand, port: rule.port ?? 9222 })
    const exploreResult = await runExploreScript({ script: rule.explore, cdpUrl: handle.cdpUrl, port: handle.port })
    teardown(handle.process)
    // Pass observations as evidence alongside source context
    opts.exploreObservations = exploreResult.result?.observations
  }

  const judgment = opts?.intentJudgments?.find(j => j.statement === rule.statement)
  // ... existing evaluation logic, but now with explore observations as additional evidence
}
```

In `cmdComplete()` (bin/roadmap.ts):
- Add `--explore` flag handling to pass `runExplore: true` and `launchCommand` to `validateNode()`
- Explore runs AFTER deterministic gates pass (need a launchable artifact first)

**Test**: Intent rule with `explore` field → complete runs explore script → observations available in ValidationResult.

### 3b. Expansion diagnostic enrichment with explore observations

**Status**: `generateIntentExpansion()` creates fix nodes with `_intentDiagnosis`. But observations from explore scripts don't flow into the diagnosis.

**What to wire:**

In `generateIntentExpansion()` (intent-expansion.ts):
```typescript
// When building _intentDiagnosis for a fix node:
_intentDiagnosis: {
  statement: f.statement,
  achievedConfidence: f.achieved,
  threshold: f.threshold,
  reasoning: f.reasoning,
  evidence: f.evidence,
  expansionDepth: depth + 1,
  failedObservations: f.observations?.filter(o => !o.pass) ?? [],  // NEW
}
```

The fix node agent sees: "checkContrast failed: ratio 1.0:1 (min: 4.5:1), textColor rgb(255,255,255), bgColor rgb(255,255,255)" — not just "dark mode doesn't work."

### 3c. Terminal intent gate prompt on init

**Status**: `validateDAG()` rejects DAGs without terminal intent + expandOnFail. But there's no UX for adding one — the error just says "add an intent gate."

**What to wire:**

When `roadmap expand` or `roadmap import` detects a missing terminal intent gate, instead of bare rejection:
1. Print the error
2. Ask: "What does 'done' look like for this roadmap?"
3. Accept a statement string
4. Auto-add `{ type: 'intent', statement: <input>, confidence: 0.9, evaluator: 'self', expandOnFail: true }` to the terminal node
5. If the project has an Electron/web entry point, suggest adding `explore` field: "Should this validate the running app? (y/n) → path to explore script"

### 3d. Gallery integration into dispatch

**Status**: `plan --gallery` exists. `/roadmap-dispatch` skill exists. They're not connected.

**What to wire:**

In the dispatch skill template, add an optional first step:
```
1. (Optional) If no DAG exists or user requests: Run `$ROADMAP_BIN plan --gallery` → present candidate DAGs → user selects → DAG committed
2. Run: `$ROADMAP_BIN orient --assign --note "$intent"`
3. ...
```

This makes `/roadmap-dispatch` the single entry point for "I have a spec, give me running agents." Gallery selects the shape, dispatch fills the slots.

### 3e. /roadmap-done explore integration

**Status**: `/roadmap-done` skill calls `complete`. But if the node has intent rules with `explore` fields, complete needs to run the explore scripts.

**What to wire in the skill template:**

Add step between "commit" and "complete":
```
5. Run: `$ROADMAP_BIN show $node` → check if any validate[] rules have type 'intent' with explore field
6. If explore rules exist:
   a. Build the project if needed
   b. Run: `$ROADMAP_BIN complete $node --note "$message" --explore`
7. If no explore rules:
   a. Run: `$ROADMAP_BIN complete $node --note "$message"`
```

The `--explore` flag tells complete to launch the app and run explore scripts before evaluating intent gates.

### 3f. /roadmap-work should surface explore requirements

**Status**: `/roadmap-work` shows produces, consumes, validate. But it doesn't highlight that some validators require explore scripts.

**What to wire in the skill template:**

Add to the presentation step:
```
If any validate[] rules have type 'intent' with explore field:
  - Highlight: "⚠️ This node has visual intent gates — an explore script at <path> will run against the live app on complete"
  - If the explore script doesn't exist yet: "You need to write it first. Call /roadmap-explore-write for the pattern library."
```

This ensures agents know upfront that their work will be validated visually, not just by reading code.

---

## 4. Verification checklist

After all fixes, this end-to-end workflow should work:

```bash
# 1. Install skills into a project
roadmap install --skills --constraints ~/.claude/CLAUDE.md
# → .claude/skills/roadmap-{start,work,done,...}/SKILL.md created

# 2. Agent invokes skill
Skill(skill: "roadmap-start", args: "iter3 planning")
# → orient + chart executed, position returned

# 3. Gallery for DAG selection
Skill(skill: "roadmap-gallery")
# → cross-roadmap display + AskUserQuestion

# 4. Dispatch with gallery
Skill(skill: "roadmap-dispatch", args: "iter3 execute")
# → optionally plan --gallery for DAG shape, then orient --assign

# 5. Worker gets brief with explore warning
Skill(skill: "roadmap-work", args: "component-themetoggle")
# → shows produces, consumes, validate
# → ⚠️ visual intent gate: scripts/explore/validate-theme.ts

# 6. Worker writes explore script
Skill(skill: "roadmap-explore-write", args: "dark mode renders correctly")
# → pattern library loaded, agent writes script

# 7. Worker iterates on explore
Skill(skill: "roadmap-explore-run", args: "scripts/explore/validate-theme.ts")
# → launches app, runs script, shows observations ✅/❌

# 8. Worker submits
Skill(skill: "roadmap-done", args: "component-themetoggle \"dark mode CSS fixed\"")
# → commit → complete --explore → explore runs → intent evaluates → passes

# 9. If intent fails with expandOnFail:
Skill(skill: "roadmap-expand", args: "component-themetoggle")
# → fix nodes generated with explore observations as evidence
# → propagate runs → new nodes appear

# 10. Progress checkpoint
Skill(skill: "roadmap-progress")
# → enriched display + AskUserQuestion steering

# 11. Terminal node with visual intent gate
# → DAG cannot close until explore script passes on live app
# → expandOnFail keeps refining until convergence or escalation
```

Every step uses a skill. No raw CLI calls. No prose instructions to interpret. The features compose through the skills — gallery feeds dispatch, explore feeds done, intent feeds expand.

---

## Files to modify (summary)

| File | Changes |
|---|---|
| `src/lib/install-skills.ts` | Directory structure fix (.claude/skills/<name>/SKILL.md), add 8 missing skills to builtinTemplates(), cleanup old .claude/commands/ |
| `src/protocol.ts` | Wire explore script execution into intent validation path in validateNode() |
| `src/lib/intent-expansion.ts` | Pass explore observations into _intentDiagnosis on fix nodes |
| `bin/roadmap.ts` | --explore flag on complete, terminal intent prompt on expand/import, output messages |
| `src/skills/roadmap-expand.md` | New template |
| `src/skills/roadmap-validate.md` | New template |
| `src/skills/roadmap-claim.md` | New template |
| `src/skills/roadmap-escalate.md` | New template |
| `src/skills/roadmap-trail.md` | New template |
| `src/skills/roadmap-checkpoint.md` | New template |
| `src/skills/roadmap-done.md` | Update: add explore detection + --explore flag |
| `src/skills/roadmap-work.md` | Update: surface explore requirements |
| `src/skills/roadmap-dispatch.md` | Update: optional plan --gallery first step |
| Tests | Path assertions, explore integration, skill count, end-to-end workflow |
