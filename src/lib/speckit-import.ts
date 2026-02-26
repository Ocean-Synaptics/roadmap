// @module speckit-import
// @exports parseTasksMd, tasksToDAG
// @types ParsedTask, ImportOptions
// @entry roadmap

// Parses a markdown task list into a candidate roadmap DAG.
// Format:
//   - [P<n>] <id>: <description>
//     - depends: <id>, <id>
//     - produces: <artifact>, <artifact>
//     - consumes: <artifact>, <artifact>
//     - mode: plan | execute
//     - validate: shell:<command>
//
// [P<n>] is priority/phase — tasks with same P value can run in parallel.
// Dependencies override phase ordering when specified.

import type { Graph, NodeSpec, ValidationRule } from '../protocol.ts';

export interface ParsedTask {
  id: string;
  desc: string;
  priority: number;
  depends: string[];
  produces: string[];
  consumes: string[];
  mode: 'execute' | 'plan';
  validate: ValidationRule[];
}

export interface ImportOptions {
  dagId: string;
  dagDesc?: string;
  version?: string;
}

const TASK_RE = /^[-*]\s+\[P(\d+)\]\s+(\S+):\s*(.+)$/;
const PROP_RE = /^\s+[-*]\s+(depends|produces|consumes|mode|validate):\s*(.+)$/;

export function parseTasksMd(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  let current: ParsedTask | null = null;

  for (const line of lines) {
    const taskMatch = line.match(TASK_RE);
    if (taskMatch) {
      if (current) tasks.push(current);
      current = {
        id: taskMatch[2],
        desc: taskMatch[3].trim(),
        priority: parseInt(taskMatch[1], 10),
        depends: [],
        produces: [],
        consumes: [],
        mode: 'execute',
        validate: [],
      };
      continue;
    }

    if (!current) continue;

    const propMatch = line.match(PROP_RE);
    if (!propMatch) {
      // Non-property line while in a task — if it's a heading or blank, close current
      if (/^#+\s/.test(line) || line.trim() === '') continue;
      // Could be continuation text — ignore
      continue;
    }

    const [, key, value] = propMatch;
    const items = value.split(',').map(s => s.trim()).filter(Boolean);

    switch (key) {
      case 'depends':
        current.depends.push(...items);
        break;
      case 'produces':
        current.produces.push(...items);
        break;
      case 'consumes':
        current.consumes.push(...items);
        break;
      case 'mode':
        if (value.trim() === 'plan') current.mode = 'plan';
        break;
      case 'validate':
        for (const item of items) {
          if (item.startsWith('shell:')) {
            current.validate.push({ type: 'shell' as any, command: item.slice(6).trim() });
          } else if (item.startsWith('exists:')) {
            current.validate.push({ type: 'artifact-exists', target: item.slice(7).trim() });
          } else {
            // Default: treat as shell command
            current.validate.push({ type: 'shell' as any, command: item.trim() });
          }
        }
        break;
    }
  }

  if (current) tasks.push(current);
  return tasks;
}

export function tasksToDAG(tasks: ParsedTask[], opts: ImportOptions): Graph<string> {
  if (tasks.length === 0) throw new Error('No tasks parsed from input');

  // Sort by priority for init/term inference
  const sorted = [...tasks].sort((a, b) => a.priority - b.priority);
  const taskIds = new Set(sorted.map(t => t.id));

  // Validate deps reference real tasks
  for (const t of sorted) {
    for (const d of t.depends) {
      if (!taskIds.has(d)) throw new Error(`Task "${t.id}" depends on unknown task "${d}"`);
    }
  }

  // Build nodes
  const nodes: Record<string, NodeSpec<string, string>> = {};

  // Init node: first priority level, no deps
  const initTasks = sorted.filter(t => t.priority === sorted[0].priority && t.depends.length === 0);
  if (initTasks.length === 0) throw new Error('No root tasks found (P0 with no dependencies)');

  // If multiple P0 tasks, synthesize an init node
  let initId: string;
  if (initTasks.length === 1 && initTasks[0].depends.length === 0) {
    initId = initTasks[0].id;
  } else {
    initId = 'init';
    if (taskIds.has('init')) initId = '_init';
    nodes[initId] = {
      id: initId,
      desc: 'Synthetic init — roots all P0 tasks',
      produces: [`${initId}.marker`],
      consumes: [],
      deps: [],
      validate: [],
      idempotent: true,
    } as any;
    // Make all P0 tasks depend on synthetic init
    for (const t of initTasks) {
      if (!t.depends.includes(initId)) t.depends.push(initId);
      if (!t.consumes.includes(`${initId}.marker`)) t.consumes.push(`${initId}.marker`);
    }
  }

  // Term node: synthesize if needed
  const maxPriority = sorted[sorted.length - 1].priority;
  const termTasks = sorted.filter(t => t.priority === maxPriority);
  let termId: string;

  // Check if any task is a natural term (nothing depends on it)
  const depTargets = new Set(sorted.flatMap(t => t.depends));
  const leafTasks = sorted.filter(t => !depTargets.has(t.id));

  if (leafTasks.length === 1) {
    termId = leafTasks[0].id;
  } else {
    termId = 'term';
    if (taskIds.has('term')) termId = '_term';
    const termConsumes = leafTasks.flatMap(t => t.produces).filter(Boolean);
    nodes[termId] = {
      id: termId,
      desc: 'Synthetic term — gates on all leaf tasks',
      produces: [],
      consumes: termConsumes,
      deps: leafTasks.map(t => t.id),
      validate: [],
      idempotent: false,
    } as any;
  }

  // Add all parsed tasks as nodes
  for (const t of sorted) {
    nodes[t.id] = {
      id: t.id,
      desc: t.desc,
      produces: t.produces,
      consumes: t.consumes,
      deps: t.depends,
      validate: t.validate,
      idempotent: true,
      ...(t.mode === 'plan' ? { mode: 'plan' } : {}),
    } as any;
  }

  return {
    id: opts.dagId,
    desc: opts.dagDesc || `Imported from spec-kit`,
    init: initId,
    term: termId,
    nodes,
    version: opts.version || '0.3.0',
    protocolVersion: '0.3.0',
  } as any;
}
