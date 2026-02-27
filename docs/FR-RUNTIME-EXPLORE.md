# FR: Runtime exploration — CDP-based behavioral observation as validation gate

## Problem

Validation today operates at two levels: deterministic (tsc, vitest, build) and intent (LLM reads code, renders judgment). Both evaluate **artifacts** — source files, build outputs, test results. Neither evaluates the **running application**.

Iteration 2 passed all deterministic validators and would pass intent evaluation on the source code. The app still had three runtime bugs:

| Bug | Why deterministic gates missed it | Why intent gates (code reading) would miss it |
|---|---|---|
| better-sqlite3 ABI mismatch | `electron-vite build` bundles JS, doesn't load native modules | Code is correct — the mismatch is between Node.js headers and Electron headers at compile time |
| White text on white background | vitest tests don't render CSS | The CSS source reads correctly — the bug is in Tailwind 4's compiled output behavior under `@media` vs `.dark` |
| Theme toggle invisible | No DOM assertion for element visibility | The component exists and is wired correctly — it's a UX placement problem only visible in the rendered layout |

The common pattern: **the code is correct but the application is broken**. Source-level evaluation — whether by compiler, test runner, or LLM — cannot catch bugs that only manifest in the running process.

The iteration 2 diagnosis session took 24 minutes: 21 screenshots via scrot/xdotool, 75 bash commands, 4 rounds of edits. The bottleneck was not fixing (3 bugs, ~20 lines changed) but **diagnosing without DOM access**. Every visual check required: activate window → sleep → scrot → magick crop → Read image → interpret pixels. No programmatic access to computed styles, element dimensions, text content, or application state.

## Prior art

The template-hmi project (`~/src/template-hmi`) implements a visual validation workflow using Chrome DevTools Protocol (CDP) attachment to live Electron applications:

```typescript
// CDP attachment — non-invasive, read-write access to running app
const browser = await chromium.connectOverCDP('http://localhost:9222')
const page = contexts[0].pages().find(p => !p.url().startsWith('devtools://'))

// Structured observations, not screenshots
const color = await item.evaluate(el => getComputedStyle(el).color)
const visible = await toggle.isVisible()
const count = await page.locator('.todo-item').count()
```

Enabled by a single flag on Electron launch: `--remote-debugging-port=9222`.

The workflow is **explore → validate → promote**: ephemeral exploration scripts capture structured observations from the live app, Claude validates observations against spec, validated observations become permanent E2E tests. Proven across 21 exploration scripts and 42 passing E2E tests on a production Electron HMI.

## Proposal

### New ValidationRule type: `runtime-explore`

```typescript
interface RuntimeExploreRule {
  type: 'runtime-explore'
  script: string                    // path to exploration script
  launch?: string                   // command to start the app (default: inferred from package.json)
  port?: number                     // CDP port (default: 9222)
  timeout?: number                  // ms to wait for app ready (default: 10000)
  observations: ObservationSpec[]   // what to check
}

interface ObservationSpec {
  id: string                        // unique identifier for this observation
  description: string               // human-readable: "todo text visible in light mode"
  type: 'assertion' | 'measurement' // assertion = pass/fail, measurement = value capture
}
```

### Exploration script contract

An exploration script is a TypeScript file that:

1. Receives CDP connection details via environment variables (`CDP_URL`, `CDP_PORT`)
2. Connects to the running application via Playwright's `chromium.connectOverCDP()`
3. Performs interactions and captures observations
4. Writes structured results to stdout as JSON

```typescript
interface ExploreResult {
  observations: ObservationResult[]
  screenshots?: string[]              // paths to captured screenshots (for audit)
  duration: number                    // ms
}

interface ObservationResult {
  id: string                          // matches ObservationSpec.id
  pass: boolean
  value?: string | number | boolean   // measured value
  evidence: string                    // human-readable: "color: #1a1a1a on bg: #ffffff, contrast 12.6:1"
}
```

### Example: todo-app runtime exploration

```typescript
// scripts/explore/validate-todo.ts
import { chromium } from '@playwright/test'

const CDP_URL = process.env.CDP_URL ?? 'http://localhost:9222'

async function explore() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const page = browser.contexts()[0].pages()
    .find(p => !p.url().startsWith('devtools://'))!

  const observations = []

  // Observation: app-launches
  observations.push({
    id: 'app-launches',
    pass: true,
    evidence: `Page loaded at ${page.url()}`
  })

  // Observation: text-visible-light
  const item = page.locator('[class*="todo"] span, [class*="Todo"] span').first()
  if (await item.count() > 0) {
    const styles = await item.evaluate(el => {
      const s = getComputedStyle(el)
      const parent = el.closest('[class*="bg-"]') ?? document.body
      return { color: s.color, bg: getComputedStyle(parent).backgroundColor }
    })
    const contrast = /* compute ratio from styles */
    observations.push({
      id: 'text-visible-light',
      pass: contrast > 4.5,
      value: contrast,
      evidence: `color: ${styles.color}, bg: ${styles.bg}, contrast: ${contrast}:1`
    })
  }

  // Observation: theme-toggle-exists
  const toggle = page.locator('[title*="theme" i], [title*="dark" i], [title*="light" i]')
  const toggleVisible = await toggle.isVisible().catch(() => false)
  observations.push({
    id: 'theme-toggle-exists',
    pass: toggleVisible,
    evidence: toggleVisible
      ? `Toggle found: ${await toggle.getAttribute('title')}`
      : 'No element with title containing "theme", "dark", or "light" is visible'
  })

  // Observation: crud-works
  const input = page.locator('input[placeholder]')
  await input.fill('Exploration test todo')
  await input.press('Enter')
  const newCount = await page.locator('[class*="todo"] span, [class*="Todo"] span').count()
  observations.push({
    id: 'crud-works',
    pass: newCount > 0,
    value: newCount,
    evidence: `After adding todo: ${newCount} items visible`
  })

  console.log(JSON.stringify({ observations, duration: Date.now() - start }))
  await browser.close()
}
```

### Integration with `roadmap complete`

Runtime exploration is a validation tier, same as deterministic and intent:

| Tier | Validators | Latency | When |
|---|---|---|---|
| Deterministic | `artifact-exists`, `shell`, `build-produces` | <1s | Always |
| Intent | `intent` with inline `--evaluate` judgments | 5–60s | On `complete --evaluate` |
| Runtime | `runtime-explore` | 10–30s | On `complete --explore` |

```bash
# Deterministic only (default)
roadmap complete integration-validated

# With intent evaluation
roadmap complete integration-validated --evaluate '[...]'

# With runtime exploration
roadmap complete integration-validated --explore

# Full validation (all tiers)
roadmap complete integration-validated --evaluate '[...]' --explore
```

### Lifecycle management

The `runtime-explore` validator handles app lifecycle:

1. **Build**: run `electron-vite build` (or `launch` command from rule) if build artifacts missing
2. **Native rebuild**: run `electron-rebuild` if native modules detected in dependencies
3. **Launch**: start app with `--remote-debugging-port=<port>`
4. **Wait**: poll CDP endpoint until responsive (up to `timeout` ms)
5. **Explore**: run the exploration script, capture stdout JSON
6. **Teardown**: kill the app process
7. **Report**: parse `ExploreResult`, map to `ValidationCheck[]`

Steps 1-3 are the "launch-check" that was missing from iteration 2. The exploration script runs only if launch succeeds. Failed launch → structured error with stderr capture, not a timeout.

### Relationship to intent evaluation

Runtime exploration and intent evaluation are complementary, not redundant:

| | Intent evaluation | Runtime exploration |
|---|---|---|
| **Evaluates** | Source code | Running application |
| **Catches** | Logic errors, contract violations, spec drift | Render bugs, runtime crashes, UX problems |
| **Requires** | File reads only | App launch + CDP connection |
| **Cost** | LLM call (~5-60s, ~$0.05-0.50) | Process lifecycle (~10-30s, ~$0) |
| **Evidence** | File:line references | Computed styles, DOM state, element dimensions |

Intent evaluation answers: "does the code express the right intent?" Runtime exploration answers: "does the app exhibit the right behavior?" The Tailwind dark mode bug passes intent evaluation on the source (the code reads correctly) but fails runtime exploration (the compiled CSS behaves differently).

### Explore → promote

Exploration scripts that validate a feature can be promoted to permanent E2E tests:

```
scripts/explore/validate-todo.ts   →   tests/e2e/todo.spec.ts
  (CDP attachment, ephemeral)            (_electron.launch, permanent)
  (observations → JSON)                  (observations → assertions)
```

The promotion is mechanical: swap `chromium.connectOverCDP()` for `_electron.launch()`, convert `observations.push({ pass: ... })` to `expect(...).toBe(...)`. Same interactions, same selectors, different lifecycle. The exploration script validates during development; the promoted test prevents regression.

This follows the template-hmi pattern exactly. Exploration is ephemeral and observation-only. Tests are permanent and assertion-based. The promotion boundary is explicit.

### Deriving exploration scripts from spec

Exploration scripts derive from **spec acceptance scenarios**, not from failure history:

```
Spec: "Toggle complete/incomplete (checkbox)"
  → ObservationSpec: { id: 'toggle-complete', description: 'checkbox toggles strikethrough' }
  → Explore: click checkbox, observe text-decoration change

Spec: "Dark/light theme via class strategy"
  → ObservationSpec: { id: 'theme-toggle-works', description: 'clicking toggle switches theme' }
  → Explore: click toggle, observe .dark class on documentElement

Spec: "CSV export with proper escaping"
  → ObservationSpec: { id: 'export-works', description: 'export dialog appears on click' }
  → Explore: click Export CSV, observe dialog
```

Each Given/When/Then in the spec maps to an interaction sequence in the exploration script. The script is a mechanical translation of the scenario, not a response to a past failure.

## Integration with gallery model

In the emit-gallery pipeline, runtime exploration is the final gate:

```
emit --gallery (4 candidates)
  → deterministic gates (tsc, vitest, build) — filter non-compiling
  → intent evaluation (code reading) — filter logic errors
  → runtime exploration (CDP observation) — filter runtime/UX bugs
  → select from survivors
```

Each candidate must launch and pass exploration to survive to selection. A candidate that compiles and reads correctly but renders white-on-white text is filtered at this stage, not discovered 24 minutes later by a human with scrot.

The exploration script runs once per surviving candidate. With 2-3 survivors (post intent-gate), that's 2-3 app launches at ~15s each = ~45s total. Cheap relative to the 24-minute alternative.

## Scope

- New: `src/protocol.ts` — `RuntimeExploreRule` added to `ValidationRule` union, `ExploreResult` and `ObservationResult` types
- New: `src/lib/runtime-explore.ts` — app lifecycle (build, rebuild, launch, wait, teardown), CDP readiness polling, exploration script execution, result parsing
- Modify: `src/lib/validate.ts` — handle `runtime-explore` type, `--explore` flag dispatch
- Modify: `bin/roadmap.ts` — `complete --explore` flag
- New: exploration script template at `src/templates/exploration.ts` (adapted from template-hmi)
- Tests: lifecycle management, CDP connection, observation parsing, timeout handling, teardown on failure

## Not in scope

- Multi-window CDP attachment (single page assumption, sufficient for most Electron apps)
- Visual regression via screenshot diffing (exploration captures screenshots for audit, not comparison)
- Automatic exploration script generation from spec (future: spec scenarios → script skeleton)
- HMR-aware exploration (exploration runs against built app, not dev server)
- Parallel exploration across candidates (sequential is sufficient at 15s per candidate; parallelize if it becomes a bottleneck)

## Open questions

1. **CDP port conflicts**: If multiple candidates need runtime exploration concurrently, they need different ports. Sequential execution avoids this. Worth solving?
2. **Exploration script authoring**: Who writes the exploration scripts — the emit phase (generated alongside code), a separate node, or the human? Template-hmi uses human-authored scripts. The roadmap pipeline may need generated scripts from spec scenarios.
3. **Observation granularity**: Should observations be fine-grained ("text color is #1a1a1a") or coarse ("text is visible")? Fine-grained gives better diagnosis on failure but couples to implementation. Coarse is spec-aligned but harder to debug.
