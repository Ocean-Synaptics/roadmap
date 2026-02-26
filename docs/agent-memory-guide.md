# Agent Memory Patterns

Memory is how agents ground themselves, learn from context, and coordinate across sessions.

## Per-Agent Memory

Each agent has a local memory context stored in `~/.claude/projects/{project}/memory/`. Memory is persisted across sessions and shared with the agent on spawn.

### Self-Orientation on Spawn

When an agent wakes up, it reads memory to understand its position within the workflow.

```typescript
// In agent startup
const memory = readMemory(projectPath);
const taskList = TaskList.fromMemory(memory.taskList);
const openTasks = taskList.filter(t => t.status === 'in_progress');
const nextTask = openTasks[0] || taskList.find(t => t.status === 'pending' && !t.blockedBy.length);

console.log(`Position: Working on ${nextTask.id}`);
console.log(`Context: ${memory.currentBriefing}`);
```

### Learned Patterns as Guards

Agents remember failed patterns and avoid repeating them.

```typescript
interface LearnedPattern {
  rule: string;  // e.g., "never retry git push --force"
  reason: string;
  timestamp: string;
}

const patterns = memory.learnedPatterns || [];
if (patterns.some(p => p.rule === 'never retry git push --force')) {
  console.warn('⚠️  Previously failed pattern detected');
  // Prompt user instead of auto-retrying
}

// When a task fails, record it
memory.learnedPatterns = [
  ...memory.learnedPatterns || [],
  {
    rule: 'check for precommit hook before committing',
    reason: 'git commit failed on missing hook setup',
    timestamp: new Date().toISOString(),
  }
];
```

### Session-Local Memory

Session-local memory persists only within a single invocation.

```typescript
interface SessionMemory {
  sessionId: string;
  startTime: Date;
  context: Map<string, unknown>;
  decisions: Array<{ key: string; value: string; timestamp: Date }>;
}

const session: SessionMemory = {
  sessionId: process.env.CLAUDE_SESSION_ID || generateId(),
  startTime: new Date(),
  context: new Map(),
  decisions: [],
};

// Store a decision for later reference
session.context.set('chosen_framework', 'zod');
session.decisions.push({
  key: 'validation_library',
  value: 'zod',
  timestamp: new Date(),
});
```

### Cross-Repo Context

When working across multiple repos, agents share a common memory pool.

```typescript
interface CrossRepoMemory {
  projectName: string;
  repos: Map<string, RepoStatus>;
  sharedContext: Map<string, unknown>;
  coordinationLog: CoordinationEntry[];
}

// Read from global memory to check sibling repo status
const globalMemory = JSON.parse(
  readFileSync(`${homedir()}/.roadmap/memory/cross-repo.json`, 'utf-8')
);

const siblingStatus = globalMemory.repos.get('fusion');
if (siblingStatus?.position === 'untracked') {
  console.log('⚠️  Sibling repo needs initialization');
}
```

## Per-Swarm Memory

Swarms maintain collective memory for coordination and learning across multiple agents.

### Collective Memory Synthesis

Swarms aggregate individual agent learnings into collective patterns.

```typescript
interface SwarmMemory {
  swarmId: string;
  agents: Map<string, AgentMemory>;
  collectivePatterns: LearnedPattern[];
  coordinationState: CoordinationState;
  decisions: Map<string, DecisionRecord>;
}

// Synthesize patterns across all agents in the swarm
function synthesizePatterns(swarm: SwarmMemory): LearnedPattern[] {
  const allPatterns = Array.from(swarm.agents.values())
    .flatMap(agent => agent.learnedPatterns || []);

  // Find common failures
  const failureFrequency = new Map<string, number>();
  for (const pattern of allPatterns) {
    failureFrequency.set(
      pattern.rule,
      (failureFrequency.get(pattern.rule) || 0) + 1
    );
  }

  // Return patterns that appear in 2+ agents
  return allPatterns.filter(
    p => (failureFrequency.get(p.rule) || 0) >= 2
  );
}

// Store synthesized patterns in swarm memory
swarm.collectivePatterns = synthesizePatterns(swarm);
```

### Memory-Driven Coordination

Agents use memory to coordinate work without explicit messaging.

```typescript
interface CoordinationEntry {
  timestamp: string;
  action: 'offer' | 'claim' | 'complete' | 'blocked' | 'unblock';
  taskId: string;
  agentName: string;
  reason?: string;
}

// Check if another agent claimed the task we want
const coordinationLog = swarmMemory.coordinationState.log;
const recentClaim = coordinationLog
  .filter(e => e.action === 'claim' && e.taskId === taskId)
  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

if (recentClaim && recentClaim.agentName !== agentName) {
  console.log(`⚠️  ${recentClaim.agentName} already claimed this task`);
  // Skip this task and find another
}

// Claim the task and record it
coordinationLog.push({
  timestamp: new Date().toISOString(),
  action: 'claim',
  taskId,
  agentName,
});
```

### Swarm-Specific Optimizations

Swarms learn which agent types perform best for specific task patterns.

```typescript
interface AgentPerformance {
  agentType: string;
  taskPattern: string;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
}

// Query performance data to assign tasks intelligently
const performances = swarmMemory.performance || [];
const testRunnerPerf = performances.find(
  p => p.agentType === 'test-runner' && p.taskPattern === 'test-suite'
);

if (testRunnerPerf && testRunnerPerf.successCount > testRunnerPerf.failureCount) {
  console.log(
    `✅ test-runner has ${testRunnerPerf.successCount} successes for tests`
  );
  // Preferentially assign test tasks to test-runner
}
```

### Memory as Audit Trail

All decisions and errors are recorded for post-session review.

```typescript
interface AuditEntry {
  timestamp: string;
  type: 'decision' | 'error' | 'tool-use' | 'message';
  context: string;
  details: Record<string, unknown>;
  operator?: string;  // which agent/user
}

// Record every significant action
auditTrail.push({
  timestamp: new Date().toISOString(),
  type: 'decision',
  context: 'task-assignment',
  details: { taskId, assignedTo: agentName, reason: 'specialist-match' },
});

// In error case
auditTrail.push({
  timestamp: new Date().toISOString(),
  type: 'error',
  context: 'git-push-failed',
  details: { repo, branch, error: 'permission-denied' },
  operator: agentName,
});

// Write audit trail for session review
writeFileSync(
  `${runDir}/audit-trail.jsonl`,
  auditTrail.map(e => JSON.stringify(e)).join('\n')
);
```

## Memory File Organization

### Directory Structure

```
~/.roadmap/memory/
  ├── README.md                          # Root orientation
  ├── MEMORY.md                          # Cross-project patterns
  ├── projects/
  │   ├── roadmap/
  │   │   ├── MEMORY.md                  # Project-specific state
  │   │   ├── task-list.json             # Current task ownership
  │   │   └── learned-patterns.jsonl     # Failure recovery
  │   └── fusion/
  │       ├── MEMORY.md
  │       └── ...
  ├── swarms/
  │   ├── {swarmId}/
  │   │   ├── config.json                # Swarm topology
  │   │   ├── coordination-log.jsonl     # All agent actions
  │   │   ├── collective-memory.md       # Shared patterns
  │   │   └── audit-trail.jsonl          # Complete action log
  │   └── ...
  └── cross-repo.json                    # Sibling status + shared context
```

### Memory Format

Memory is stored in three formats:

- **JSON** (`*.json`) — Structured state, parsed and validated
- **JSONL** (`*.jsonl`) — Append-only logs, one entry per line
- **Markdown** (`*.md`) — Human-readable summaries and patterns

```typescript
// Example: Load project memory
const memory = JSON.parse(
  readFileSync(`${homedir()}/.roadmap/memory/projects/fusion/MEMORY.md`)
);

// Example: Append to coordination log
appendFileSync(
  `${runDir}/coordination-log.jsonl`,
  JSON.stringify({ timestamp: now, action: 'claim', taskId }) + '\n'
);
```

## Lifecycle

### On Agent Spawn

1. Read `~/.roadmap/memory/{projectName}/MEMORY.md` for state
2. Load task list from memory
3. Filter blocked/completed tasks
4. Find next available task
5. Inform team lead of position

```typescript
async function agentStartup(projectName: string, agentName: string) {
  const memory = await loadProjectMemory(projectName);
  const taskList = TaskList.fromJSON(memory.taskList);

  console.log(`Starting ${agentName}`);
  console.log(`Tasks: ${taskList.filter(t => t.status === 'pending').length} pending`);

  return {
    tasks: taskList,
    briefing: memory.currentBriefing,
    patterns: memory.learnedPatterns,
  };
}
```

### During Execution

1. Before each tool invocation, check learned patterns for guards
2. After each action, record to session memory
3. On task completion, update task list in memory
4. On error, record to failure patterns for future reference

### On Agent Shutdown

1. Compute final state from session memory
2. Merge into project memory
3. Write audit trail
4. Notify team of completion

```typescript
async function agentShutdown(projectName: string, agentName: string) {
  const sessionMemory = getSessionMemory();
  const projectMemory = await loadProjectMemory(projectName);

  // Merge session decisions
  projectMemory.lastSession = {
    timestamp: new Date().toISOString(),
    agent: agentName,
    tasksClaimed: sessionMemory.tasksClaimed,
    tasksCompleted: sessionMemory.tasksCompleted,
    decisions: sessionMemory.decisions,
  };

  // Record new patterns
  projectMemory.learnedPatterns = [
    ...projectMemory.learnedPatterns || [],
    ...sessionMemory.discoveredPatterns,
  ];

  await saveProjectMemory(projectName, projectMemory);
}
```

## Best Practices

1. **Keep memory lean** — Store only what changes behavior; avoid duplication
2. **Timestamp everything** — Enable causality analysis and debugging
3. **Version memory schemas** — Document breaking changes in MEMORY.md headers
4. **Audit trail first** — Log decisions before executing, not after
5. **Guard against replay** — Use session IDs to prevent duplicate actions
6. **Share patterns, not commands** — Let other agents learn, not follow scripts

## See Also

- `roadmap/agent` — Sealed agent API with memory integration
- `docs/api-surface.md` — API for memory queries and updates
- `.roadmap/memory/` — Global memory initialization and migration
