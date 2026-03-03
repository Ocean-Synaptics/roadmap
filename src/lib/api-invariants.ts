// @module api-invariants
// @exports getMakeInvariants

export interface MakeInvariant {
  id: string;           // e.g. 'terminal-intent-gate'
  gate: string;         // which validation function
  requirement: string;  // human-readable requirement
  appliesTo: string;    // which node(s) this applies to
  example: object;      // example of a passing validator rule
  skipFlag?: string;    // CLI flag to skip this check, if any
}

export function getMakeInvariants(): MakeInvariant[] {
  return [
    {
      id: 'terminal-intent-gate',
      gate: 'validateTerminalIntentGate()',
      requirement: 'Terminal node (term) requires at least one intent rule with expandOnFail: true',
      appliesTo: 'terminal node (term or single leaf)',
      example: {
        type: 'intent',
        statement: 'All work complete',
        confidence: 0.9,
        evaluator: 'self',
        expandOnFail: true,
      },
      skipFlag: '--skip-terminal-intent',
    },
    {
      id: 'init-boundary-gate',
      gate: 'validateInitIntentGate()',
      requirement: 'Init boundary nodes (P0 tasks wired to init) require an intent rule with expandOnFail: true and statement mentioning plan/clarity/unambiguous',
      appliesTo: 'init boundary nodes (direct dependents of init)',
      example: {
        type: 'intent',
        statement: 'Plan clarity: task scope is unambiguous',
        confidence: 0.9,
        evaluator: 'self',
        expandOnFail: true,
      },
    },
    {
      id: 'schema-version-required',
      gate: 'make validation',
      requirement: 'Spec must have schema_version field',
      appliesTo: 'spec root',
      example: {
        schema_version: '1.0.0',
      },
    },
    {
      id: 'tasks-array-required',
      gate: 'make validation',
      requirement: 'Spec must have tasks array',
      appliesTo: 'spec root',
      example: {
        tasks: [
          {
            id: 'task-1',
            type: 'execute',
            produces: ['file.txt'],
            validate: [],
          },
        ],
      },
    },
    {
      id: 'metadata-required',
      gate: 'make validation',
      requirement: 'Spec must have metadata object with generated and compile_hash',
      appliesTo: 'spec root',
      example: {
        metadata: {
          generated: '2026-03-03T00:00:00Z',
          compile_hash: 'abc123def456',
        },
      },
    },
    {
      id: 'inputs-required',
      gate: 'make validation',
      requirement: 'Spec must have non-empty inputs array with at least one spec/tasks/plan role',
      appliesTo: 'spec root',
      example: {
        inputs: [
          {
            path: 'requirements.md',
            sha256: 'abc123def456',
            role: 'spec',
          },
        ],
      },
      skipFlag: '--skip-input-verification',
    },
    {
      id: 'input-hash-verified',
      gate: 'make validation',
      requirement: 'Each input sha256 must match file on disk',
      appliesTo: 'each entry in inputs[]',
      example: {
        path: 'requirements.md',
        sha256: 'abc123def456',
        role: 'spec',
      },
      skipFlag: '--skip-input-verification',
    },
    {
      id: 'no-raw-dag',
      gate: 'make validation',
      requirement: 'Spec must not be a raw DAG (has nodes but no tasks)',
      appliesTo: 'spec root',
      example: {
        tasks: [],
      },
    },
    {
      id: 'dag-structural',
      gate: 'define()',
      requirement: 'DAG must pass define() — no cycles, has init+term',
      appliesTo: 'generated DAG',
      example: {
        id: 'valid-dag',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            desc: 'start',
            produces: [],
            consumes: [],
            deps: [],
            validate: [],
          },
        },
      },
    },
    {
      id: 'dag-contracts',
      gate: 'verify()',
      requirement: 'DAG must pass verify() — all consumes satisfied by predecessor produces',
      appliesTo: 'generated DAG',
      example: {
        id: 'valid-dag',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            produces: ['artifact.txt'],
          },
          task1: {
            id: 'task1',
            deps: ['init'],
            consumes: ['artifact.txt'],
          },
        },
      },
    },
    {
      id: 'dag-reachability',
      gate: 'check()',
      requirement: 'DAG must pass check() — every node reachable from init and to term',
      appliesTo: 'generated DAG',
      example: {
        id: 'valid-dag',
        init: 'init',
        term: 'term',
        nodes: {
          init: {
            id: 'init',
            deps: [],
          },
          middle: {
            id: 'middle',
            deps: ['init'],
          },
          term: {
            id: 'term',
            deps: ['middle'],
          },
        },
      },
    },
  ];
}
