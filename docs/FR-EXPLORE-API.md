# FR: Explore API surface — expose helpers to consumer scripts via CLI and package exports

## Status: ✅ IMPLEMENTED

**Package export**: `roadmap/explore` ✓
**CLI modes**: `--api`, `--run`, `--eval` ✓
**Helper count**: 36 total (17 observation + 19 interaction + runtime orchestration)

## Problem

The explore pattern library (observation + interaction helpers) lives inside the roadmap package but is not importable by consumer projects. Explore scripts in payload repos must either:

1. Inline all helpers (200+ lines of boilerplate per script), or
2. Import directly from roadmap source paths (`/home/griffin/src/roadmap/src/lib/exploration/*.ts`) — brittle, non-portable

The skill templates (`roadmap-explore-write`, `roadmap-explore-run`) describe the patterns as prose for agents to read, but agents can't `import { checkVisible } from 'roadmap/explore'` because no such export exists.

### Evidence

In the todo-app iter2 validation session, a 120-line explore script was written with every helper inlined — `checkVisible`, `checkContrast`, `parseColor`, `getLuminance`, `contrastRatio`, `safeClick`, `typeAndSubmit`, `connectAndFindPage`. The script worked, but it's a copy-paste of code that already exists in `explore-helpers.ts` and `explore-interactions.ts`.

When the helpers were dropped and raw Playwright was used instead, the agent had to discover selector patterns, handle opacity-0 buttons, and manage CDP connection — all problems the helpers already solve.

## Implementation Status

### ✅ Package Export: `roadmap/explore`

**Location**: `src/index.explore.ts`
**Exports**:
- 17 observation helpers: `checkVisible`, `checkText`, `checkStyle`, `checkSize`, `checkCount`, `checkAttribute`, `checkClass`, `checkContrast`, `checkOverflow`, `checkDisabled`, `checkChecked`, `checkContainsText`, `checkInputValue`, `checkUrl`, `checkTitle`, `checkComputedStyle`, `checkInViewport`
- 19 interaction helpers: `safeClick`, `typeAndSubmit`, `drag`, `waitFor`, `waitForTransition`, `connectAndFindPage`, `resetState`, `fillForm`, `selectFromDropdown`, `toggleCheckbox`, `getListItems`, `findItemBy`, `getTableData`, `waitForNetwork`, `waitForTextChange`, `capturePageState`, `getConsoleMessages`, `getNetworkCalls`, `screenshot`
- Runtime orchestration: `launchApp`, `runExploreScript`, `mapObservationsToChecks`, `teardown`
- Types: `LaunchHandle`, `ExploreScriptResult`, `ObservationResult`, `ExploreResult`

**Usage**:
```typescript
import { checkVisible, safeClick, connectAndFindPage } from 'roadmap/explore'
```

### ✅ CLI Command: `roadmap util explore`

Three modes available:

#### `roadmap util explore --api`
Dump API surface for agent context injection:
```bash
$ roadmap util explore --api

Explore API — import from "roadmap/explore"

Observation helpers (17):
  checkVisible(page: Page, selector: string, label: string) → ObservationResult
  ...

Interaction helpers (19):
  safeClick(page: Page, selector: string) → void
  ...

Runtime orchestration:
  launchApp(opts: {...}) → LaunchHandle
  ...
```

#### `roadmap util explore --run <script.ts>`
Execute explore script with managed CDP lifecycle:
```bash
roadmap util explore --run my-script.ts --launch "npm start" --port 9222
```

#### `roadmap util explore --eval <code>`
Evaluate inline explore code (future):

## Proposal

### 1. Package export: `roadmap/explore`

Add to `package.json` exports:
```json
{
  "exports": {
    "./explore": "./src/index.explore.ts"
  }
}
```

`src/index.explore.ts` re-exports everything an explore script needs:
```typescript
// Observation helpers
export { checkVisible, checkText, checkStyle, checkSize, checkCount, checkAttribute, checkClass, checkContrast, checkOverflow } from './lib/explore-helpers.ts'

// Interaction helpers
export { safeClick, typeAndSubmit, drag, waitFor, waitForTransition, connectAndFindPage, resetState } from './lib/explore-interactions.ts'

// Types
export type { ObservationResult, ExploreResult } from './protocol.ts'
```

Consumer script becomes:
```typescript
import { connectAndFindPage, checkVisible, checkContrast, safeClick, typeAndSubmit } from 'roadmap/explore'

const { page, browser } = await connectAndFindPage(process.env.CDP_URL ?? 'http://localhost:9222')

const obs = []
obs.push(await checkVisible(page, 'input[placeholder]', 'Todo input'))
obs.push(await checkContrast(page, '.todo-item', 'body', 4.5, 'Text contrast'))
await typeAndSubmit(page, 'input', 'New todo')
obs.push(await checkVisible(page, 'text=New todo', 'Todo created'))

console.log(JSON.stringify({ observations: obs }))
await browser.close()
```

### 2. CLI command: `roadmap explore`

Three modes:

#### `roadmap explore --api`
Dump the full API surface as structured output for agent context injection:
```
Observation helpers (import from 'roadmap/explore'):
  checkVisible(page, selector, label) → ObservationResult
  checkText(page, selector, label) → ObservationResult
  checkStyle(page, selector, property, label) → ObservationResult
  checkSize(page, selector, minW, minH, label) → ObservationResult
  checkCount(page, selector, expected, label) → ObservationResult
  checkAttribute(page, selector, attr, expected, label) → ObservationResult
  checkClass(page, selector, className, label) → ObservationResult
  checkContrast(page, textSel, bgSel, minRatio, label) → ObservationResult
  checkOverflow(page, selector, label) → ObservationResult

Interaction helpers (import from 'roadmap/explore'):
  safeClick(page, selector) → void
  typeAndSubmit(page, selector, text, key?) → void
  drag(page, sourceSelector, targetSelector, opts?) → void
  waitFor(page, selector, timeout?) → Locator
  waitForTransition(page, ms?) → void
  connectAndFindPage(cdpUrl) → { page, browser }
  resetState(page) → void

Types:
  ObservationResult = { id: string, pass: boolean, evidence: string, value?: string | number | boolean }
  ExploreResult = { observations: ObservationResult[] }
```

`--json` flag emits machine-readable format for programmatic consumption.

#### `roadmap explore --run <script.ts> [--launch <cmd>] [--port 9222] [--build <cmd>] [--keep-alive]`
Managed execution: build → launch app → poll CDP → run script → present results → teardown.

Equivalent to what `complete --explore` does internally, but standalone for iteration loops. The script receives `CDP_URL` and `CDP_PORT` env vars. Output is the observation table:

```
🔬 Explore: validate-app.ts

✅ todo-input              Visible at input[placeholder]
✅ text-contrast           4.87:1 (min: 4.5:1) — text: rgb(9,9,9), bg: rgb(255,255,255)
❌ dark-mode-contrast      1.00:1 (min: 4.5:1) — text: rgb(255,255,255), bg: rgb(255,255,255)
✅ crud-add                Found 1, expected >= 1

3/4 passing · 1 failure
```

`--keep-alive` leaves the app running between runs for fast iteration.

#### `roadmap explore --eval '<inline script>'`
One-shot inline evaluation for quick checks from the command line:
```bash
roadmap explore --eval 'obs.push(await checkVisible(page, "input", "Input"))' --port 9222
```

The CLI wraps the snippet in CDP connection boilerplate, runs it, and prints observations. For when you need one check, not a full script file.

### 3. Consumer project setup

Consumer adds roadmap as a dev dependency (or uses path resolution via `tsx`):
```bash
# Option A: npm/pnpm link
pnpm add -D roadmap@link:/home/griffin/src/roadmap

# Option B: tsconfig paths (no install needed)
# tsconfig.json: { "paths": { "roadmap/*": ["/home/griffin/src/roadmap/src/*"] } }
```

Playwright is a peer dependency of the explore surface — consumer must have `@playwright/test` installed.

## Scope

### In scope
- `src/index.explore.ts` — new export barrel
- `package.json` exports entry — `"./explore"`
- `bin/roadmap.ts` — `cmdExplore()` with `--api`, `--run`, `--eval` modes
- Tests for export resolution and CLI output format

### Out of scope
- Modifying existing helpers (they work as-is)
- Auto-install of Playwright in consumer projects
- Visual diff / screenshot comparison (future FR)

## Validation

- `import { checkVisible } from 'roadmap/explore'` resolves in a consumer project
- `roadmap explore --api` outputs all 16 functions with correct signatures
- `roadmap explore --run scripts/validate.ts --launch "npx electron ."` runs end-to-end
- Existing `complete --explore` still works (no regression)

## Dependencies

- FR-RUNTIME-EXPLORE (shipped) — the helpers and interactions this FR exposes
- FIXUP-WORKFLOW-INTEGRATION (partial) — explore skills registration (orthogonal, not blocking)
