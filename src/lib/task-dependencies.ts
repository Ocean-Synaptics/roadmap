// @module task-dependencies
// @exports linkDependencies, validateNoCycles
// @types Task
// @entry roadmap/task-dependencies

/**
 * Represents a task with dependency information.
 */
export interface Task {
  nodeId: string;
  dependencies: string[];
  [key: string]: unknown;
}

/**
 * Link task dependencies by adding edges from dependencies to dependents.
 * Mutates the tasks array by ensuring each task has a dependencies array.
 */
export function linkDependencies(tasks: Task[]): Task[] {
  const taskMap = new Map<string, Task>();

  // Build lookup map
  for (const task of tasks) {
    taskMap.set(task.nodeId, task);
  }

  // Ensure all tasks have dependencies array
  for (const task of tasks) {
    if (!task.dependencies) {
      task.dependencies = [];
    }
  }

  return tasks;
}

/**
 * Validate that task dependencies form no cycles.
 * Returns true if acyclic, false if a cycle is detected.
 */
export function validateNoCycles(tasks: Task[]): boolean {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  // Initialize maps
  for (const task of tasks) {
    inDegree.set(task.nodeId, 0);
    adj.set(task.nodeId, []);
  }

  // Build adjacency list and in-degree counts
  for (const task of tasks) {
    if (!Array.isArray(task.dependencies)) continue;

    for (const dep of task.dependencies) {
      if (!adj.has(dep)) continue; // Skip unknown dependencies
      adj.get(dep)!.push(task.nodeId);
      inDegree.set(task.nodeId, (inDegree.get(task.nodeId) ?? 0) + 1);
    }
  }

  // Kahn's algorithm: process all nodes with in-degree 0
  const queue: string[] = [];
  for (const [id, deg] of Array.from(inDegree)) {
    if (deg === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visited++;

    for (const next of adj.get(curr) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // If visited < total tasks, there's a cycle
  return visited === tasks.length;
}
