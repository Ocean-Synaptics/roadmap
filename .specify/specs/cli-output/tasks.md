# CLI Output Audit — Tasks

## co-audit-console-log
desc: Audit all console.log calls in bin/roadmap.ts command functions — replace with json() calls routing human text to stderr
produces: [bin/roadmap.ts]
consumes: [src/lib/cli-envelope.ts, src/lib/cli-human.ts, src/lib/render/index.ts]
deps: []
validate:
  - shell: grep -c 'console\.log' bin/roadmap.ts | awk '{exit ($1 > 5 ? 1 : 0)}'
  - shell: npx tsx bin/roadmap.ts chart --note "validate" 2>/dev/null | jq -e '.ok' >/dev/null
  - shell: npx tsx bin/roadmap.ts doctor completion 2>/dev/null | jq -e '.ok' >/dev/null
  - shell: npx tsx bin/roadmap.ts remaining 2>/dev/null | jq -e '.ok' >/dev/null
mode: execute

## co-render-models
desc: Build RenderModel for every stateful command missing one — advance, complete, validate, doctor, remaining, status, plan-gallery, plan-select, plan-status, certify
produces: [bin/roadmap.ts]
consumes: [src/lib/cli-human.ts, src/lib/render/index.ts]
deps: [co-audit-console-log]
validate:
  - shell: npx tsx bin/roadmap.ts orient --note "validate" 2>/dev/null | jq -e '.render.body' >/dev/null
  - shell: npx tsx bin/roadmap.ts chart --note "validate" 2>/dev/null | jq -e '.render.body' >/dev/null
  - shell: npx tsx bin/roadmap.ts doctor completion 2>/dev/null | jq -e '.render.body' >/dev/null
  - shell: npx tsx bin/roadmap.ts remaining 2>/dev/null | jq -e '.render.body' >/dev/null
mode: execute

## co-stdout-tests
desc: Add tests verifying stdout is clean JSON for chart, doctor, remaining, and that render.body is populated for all stateful commands
produces: [tests/cli-output.test.ts]
consumes: [bin/roadmap.ts, src/lib/cli-envelope.ts]
deps: [co-render-models]
validate:
  - artifact-exists: tests/cli-output.test.ts
  - shell: npx vitest run tests/cli-output.test.ts --reporter=verbose 2>&1 | tail -1 | grep -q 'passed'
mode: execute

## co-integration-jq
desc: Integration test — pipe orient, chart, complete, advance, validate, doctor, remaining through jq and verify exit 0 + render.body non-empty
produces: [tests/cli-output-integration.test.ts]
consumes: [bin/roadmap.ts]
deps: [co-render-models]
validate:
  - artifact-exists: tests/cli-output-integration.test.ts
  - shell: npx vitest run tests/cli-output-integration.test.ts --reporter=verbose 2>&1 | tail -1 | grep -q 'passed'
mode: execute
