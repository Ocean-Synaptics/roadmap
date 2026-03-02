import { Graph, NodeSpec } from '../roadmap';

export default function expand(): Graph<
  | 'dag-manifest-impl'
  | 'dag-manifest-tests'
  | 'design-doc-hook-impl'
  | 'design-doc-hook-tests'
  | 'task-validator-impl'
  | 'task-validator-tests'
  | 'worktree-cleanup-impl'
  | 'worktree-cleanup-hook'
  | 'clutter-prevention-gates'
> {
  return {
    id: 'enforcement-hardening-001',
    desc: 'Enforce invariants to prevent clutter: task list hygiene, design doc commitment, worktree cleanup, DAG documentation.',
    init: 'dag-manifest-impl',
    term: 'clutter-prevention-gates',
    nodes: {
      'dag-manifest-impl': {
        id: 'dag-manifest-impl',
        desc: 'Implement dag-manifest.ts — scan .roadmap/head.*.json, validate documentation, enforce pre-commit.',
        produces: ['src/lib/enforcement/dag-manifest.ts'],
        consumes: ['.roadmap/head.json'],
        deps: [],
        validate: [{ type: 'artifact-exists', path: 'src/lib/enforcement/dag-manifest.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'dag-manifest-tests': {
        id: 'dag-manifest-tests',
        desc: 'Test dag-manifest.ts — unit + integration tests for orphan detection, validation rules.',
        produces: ['tests/dag-manifest.test.ts'],
        consumes: ['src/lib/enforcement/dag-manifest.ts'],
        deps: ['dag-manifest-impl'],
        validate: [{ type: 'artifact-exists', path: 'tests/dag-manifest.test.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'design-doc-hook-impl': {
        id: 'design-doc-hook-impl',
        desc: 'Implement design-doc-hook.sh — pre-commit enforcement for design docs during phase transitions.',
        produces: ['src/lib/enforcement/design-doc-hook.sh'],
        consumes: ['.roadmap/task-5-artifact-gates-design.md'],
        deps: [],
        validate: [{ type: 'artifact-exists', path: 'src/lib/enforcement/design-doc-hook.sh' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'design-doc-hook-tests': {
        id: 'design-doc-hook-tests',
        desc: 'Test design-doc-hook.sh — validate enforcement logic, test bypass scenarios.',
        produces: ['tests/design-doc-hook.test.ts'],
        consumes: ['src/lib/enforcement/design-doc-hook.sh'],
        deps: ['design-doc-hook-impl'],
        validate: [{ type: 'artifact-exists', path: 'tests/design-doc-hook.test.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'task-validator-impl': {
        id: 'task-validator-impl',
        desc: 'Implement task-list-validator.ts — enforce no stale tasks, flag in_progress > 48h, require evidence on completion.',
        produces: ['src/lib/enforcement/task-list-validator.ts'],
        consumes: ['.claude/CLAUDE.md', 'tasks/'],
        deps: [],
        validate: [{ type: 'artifact-exists', path: 'src/lib/enforcement/task-list-validator.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'task-validator-tests': {
        id: 'task-validator-tests',
        desc: 'Test task-list-validator.ts — stale detection, evidence validation, edge cases.',
        produces: ['tests/task-list-validator.test.ts'],
        consumes: ['src/lib/enforcement/task-list-validator.ts'],
        deps: ['task-validator-impl'],
        validate: [{ type: 'artifact-exists', path: 'tests/task-list-validator.test.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'worktree-cleanup-impl': {
        id: 'worktree-cleanup-impl',
        desc: 'Implement worktree-cleanup.ts — git worktree prune, orphan detection, dead agent branch cleanup.',
        produces: ['src/lib/enforcement/worktree-cleanup.ts'],
        consumes: ['.claude/worktrees/'],
        deps: [],
        validate: [{ type: 'artifact-exists', path: 'src/lib/enforcement/worktree-cleanup.ts' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'worktree-cleanup-hook': {
        id: 'worktree-cleanup-hook',
        desc: 'Implement post-session-cleanup.sh — invoke worktree cleanup on session end.',
        produces: ['src/hooks/post-session-cleanup.sh'],
        consumes: ['src/lib/enforcement/worktree-cleanup.ts'],
        deps: ['worktree-cleanup-impl'],
        validate: [{ type: 'artifact-exists', path: 'src/hooks/post-session-cleanup.sh' }],
        idempotent: true,
      } as NodeSpec<any, any>,
      'clutter-prevention-gates': {
        id: 'clutter-prevention-gates',
        desc: 'Integrate all 4 enforcement rules into regent hook enforcement. Final validation + launch-check.',
        produces: [],
        consumes: [
          'src/lib/enforcement/dag-manifest.ts',
          'src/lib/enforcement/design-doc-hook.sh',
          'src/lib/enforcement/task-list-validator.ts',
          'src/lib/enforcement/worktree-cleanup.ts',
          'src/hooks/post-session-cleanup.sh',
        ],
        deps: [
          'dag-manifest-tests',
          'design-doc-hook-tests',
          'task-validator-tests',
          'worktree-cleanup-hook',
        ],
        validate: [{ type: 'shell', cmd: 'npm test -- --grep "enforcement"' }],
        idempotent: true,
      } as NodeSpec<any, any>,
    },
  };
}
