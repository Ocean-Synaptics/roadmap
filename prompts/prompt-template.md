# {{task_definition}}

## Context

**Domain**: {{domain}}

**Files to read**:
{{files_list}}

**Constraints**:
{{constraints}}

**Entities**:
{{entities}}

**Quick check**: `{{quick_check}}`

## Scope Boundaries

**Allowed to modify** (produces):
{{allowed_to_modify}}

**Read-only** (consumes + ambient):
{{read_only}}

**Forbidden**: any file not listed above. Single-domain rule: do not touch files outside the {{domain}} domain.

## Required Artifacts

{{required_artifacts}}

## Verification

{{verification_checklist}}

## Failure Handling

STOP if blocked. Output one blocking question. Do not guess, do not expand scope, do not modify adjacent code.

## Executor Instructions

Execute-only mode. Produce exactly the artifacts listed above. Do not:
- Refactor adjacent code
- Add features beyond what the artifacts require
- Expand scope beyond this node's domain
- Read files not listed in Context

Verify with: `{{quick_check}}`
