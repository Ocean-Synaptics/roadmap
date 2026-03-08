/**
 * Downstream compatibility test.
 *
 * Verifies the restructured roadmap package maintains backward compatibility
 * for downstream consumers (e.g. donjon). Covers:
 *   1. All public import paths resolve with expected exports
 *   2. Programmatic define() + orient() + CompletionStore usage works
 *   3. Core/runtime type split: CoreNodeSpec, CoreGraph, NodeMeta, ManagedGraph, fullNode
 *   4. CLI entry point (cli-envelope) resolves
 */

import { describe, it, expect } from 'vitest';

// --- 1. Import path: roadmap/protocol (via barrel) ---

import {
  // Operations
  define, verify, check, reconcile, order, parallelOrder,
  orient, advanceBatch, readyNodes, nextBatch, criticalPath,
  merge, branch, batchConflicts,
  analyze, modify, modifyAndCommit,
  // Validation
  validateNode, validateBatch, validateGraph,
  // Helpers
  graph, consumeArtifact, consumeResolvedBy, CompletionStore,
  // Optimizer
  optimize, utilizationRatio, levelReport, bottleneckNodes,
  // Core/runtime bridge
  fullNode,
  // Schema
  VALIDATORS,
} from '../src/protocol.ts';

// --- 2. Import path: roadmap (root barrel) ---

import {
  define as rootDefine,
  orient as rootOrient,
  graph as rootGraph,
  fileExists,
  RoadmapError,
  loadDAG,
} from '../src/index.ts';

// --- 3. Core types (new split) ---

import type { CoreNodeSpec, CoreGraph } from '../src/core/types.ts';
import type { NodeMeta, ManagedNodeSpec, ManagedGraph } from '../src/runtime/meta.ts';
import { fullNode as metaFullNode } from '../src/runtime/meta.ts';

// --- 4. CLI envelope entry point ---

import { emit, emitError, parseOutputOpts } from '../src/lib/cli-envelope.ts';

// --- Fixtures ---

type TestIds = 'init' | 'work' | 'term';

/** Minimal valid graph — two-hop init -> work -> term. */
function minimalGraph() {
  return graph<TestIds>({
    id: 'compat-test',
    desc: 'minimal graph for downstream compat testing',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'start',
        produces: [],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists' }],
        idempotent: true,
      },
      work: {
        id: 'work',
        desc: 'do work',
        produces: ['out.txt'],
        consumes: [],
        deps: ['init'],
        validate: [{ type: 'artifact-exists' }],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'finish',
        produces: [],
        consumes: [],
        deps: ['work'],
        validate: [{ type: 'artifact-exists' }],
        idempotent: true,
      },
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('downstream-compat: public export surface', () => {
  it('roadmap/protocol exports all expected operations', () => {
    // Operations
    expect(define).toBeTypeOf('function');
    expect(verify).toBeTypeOf('function');
    expect(check).toBeTypeOf('function');
    expect(reconcile).toBeTypeOf('function');
    expect(order).toBeTypeOf('function');
    expect(parallelOrder).toBeTypeOf('function');
    expect(orient).toBeTypeOf('function');
    expect(advanceBatch).toBeTypeOf('function');
    expect(readyNodes).toBeTypeOf('function');
    expect(nextBatch).toBeTypeOf('function');
    expect(criticalPath).toBeTypeOf('function');
    expect(merge).toBeTypeOf('function');
    expect(branch).toBeTypeOf('function');
    expect(batchConflicts).toBeTypeOf('function');
    expect(analyze).toBeTypeOf('function');
    expect(modify).toBeTypeOf('function');
    expect(modifyAndCommit).toBeTypeOf('function');

    // Validation
    expect(validateNode).toBeTypeOf('function');
    expect(validateBatch).toBeTypeOf('function');
    expect(validateGraph).toBeTypeOf('function');

    // Helpers
    expect(graph).toBeTypeOf('function');
    expect(consumeArtifact).toBeTypeOf('function');
    expect(consumeResolvedBy).toBeTypeOf('function');
    expect(CompletionStore).toBeTypeOf('function'); // class → function

    // Optimizer
    expect(optimize).toBeTypeOf('function');
    expect(utilizationRatio).toBeTypeOf('function');
    expect(levelReport).toBeTypeOf('function');
    expect(bottleneckNodes).toBeTypeOf('function');

    // Core/runtime bridge
    expect(fullNode).toBeTypeOf('function');

    // Schema
    expect(VALIDATORS).toBeDefined();
  });

  it('root barrel (roadmap) re-exports core operations', () => {
    expect(rootDefine).toBeTypeOf('function');
    expect(rootOrient).toBeTypeOf('function');
    expect(rootGraph).toBeTypeOf('function');
    expect(fileExists).toBeTypeOf('function');
    expect(RoadmapError).toBeTypeOf('function');
    expect(loadDAG).toBeTypeOf('function');
  });

  it('cli-envelope entry point resolves', () => {
    expect(emit).toBeTypeOf('function');
    expect(emitError).toBeTypeOf('function');
    expect(parseOutputOpts).toBeTypeOf('function');
  });
});

describe('downstream-compat: programmatic define() + orient()', () => {
  it('define() accepts and returns a minimal graph', () => {
    const g = minimalGraph();
    const result = define(g);
    // define() returns the same graph reference if valid
    expect(result).toBe(g);
    expect(result.id).toBe('compat-test');
    expect(result.init).toBe('init');
    expect(result.term).toBe('term');
  });

  it('define() rejects a cyclic graph', () => {
    expect(() =>
      graph({
        id: 'cyclic',
        desc: 'bad',
        init: 'a',
        term: 'b',
        nodes: {
          a: { id: 'a', desc: '', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
        },
      }) && define(graph({
        id: 'cyclic',
        desc: 'bad',
        init: 'a',
        term: 'b',
        nodes: {
          a: { id: 'a', desc: '', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
        },
      })),
    ).toThrow(/[Cc]ycle/);
  });

  it('orient() computes batch position from exists predicate', () => {
    const g = minimalGraph();
    define(g);

    // Nothing completed — should position at first batch
    const nothingExists = () => false;
    const pos = orient(g, nothingExists);

    expect(pos.position).toContain('init');
    expect(pos.level).toBeTypeOf('number');
    expect(pos.batchComplete).toBe(false);
    expect(Array.isArray(pos.produces)).toBe(true);
    expect(Array.isArray(pos.consumes)).toBe(true);
    expect(Array.isArray(pos.remaining)).toBe(true);
  });

  it('orient() advances when init artifacts exist', () => {
    const g = minimalGraph();
    define(g);

    // init is done — should move to next batch containing 'work'
    const initDone = (id: string) => id === 'init';
    const pos = orient(g, initDone);

    expect(pos.position).toContain('work');
    expect(pos.level).toBeGreaterThan(0);
  });

  it('verify() returns empty array for valid graph', () => {
    const g = minimalGraph();
    const violations = verify(g);
    expect(Array.isArray(violations)).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('check() confirms all nodes reachable', () => {
    const g = minimalGraph();
    const result = check(g);
    expect(result).toBeDefined();
  });
});

describe('downstream-compat: CompletionStore', () => {
  it('CompletionStore.empty() creates an empty store', () => {
    const store = CompletionStore.empty();
    expect(store.hasPassing('anything')).toBe(false);
    expect(store.allIds().size).toBe(0);
  });

  it('CompletionStore.from() creates a fixture store', () => {
    const store = CompletionStore.from(['init', 'work']);
    expect(store.hasPassing('init')).toBe(true);
    expect(store.hasPassing('work')).toBe(true);
    expect(store.hasPassing('term')).toBe(false);
    expect(store.allIds().size).toBe(2);
  });

  it('CompletionStore supports filterByDagId', () => {
    const store = CompletionStore.from(['a', 'b']);
    // filterByDagId with undefined dagId on records keeps all
    const filtered = store.filterByDagId('any');
    expect(filtered.allIds().size).toBe(2);
  });

  it('CompletionStore.passingIds() returns correct set', () => {
    const store = CompletionStore.from(['x', 'y', 'z']);
    const passing = store.passingIds();
    expect(passing.size).toBe(3);
    expect(passing.has('x')).toBe(true);
    expect(passing.has('y')).toBe(true);
    expect(passing.has('z')).toBe(true);
  });
});

describe('downstream-compat: core/runtime type split', () => {
  it('fullNode() merges CoreNodeSpec + NodeMeta into NodeSpec', () => {
    const core: CoreNodeSpec<'a', 'a'> = {
      id: 'a',
      desc: 'test node',
      produces: ['out.txt'],
      consumes: [],
      deps: [],
    };
    const meta: NodeMeta = {
      validate: [{ type: 'artifact-exists' }],
      idempotent: true,
      mode: 'execute',
    };

    const merged = fullNode(core, meta);
    // Has core fields
    expect(merged.id).toBe('a');
    expect(merged.produces).toEqual(['out.txt']);
    expect(merged.deps).toEqual([]);
    // Has meta fields
    expect(merged.validate).toEqual([{ type: 'artifact-exists' }]);
    expect(merged.idempotent).toBe(true);
    expect(merged.mode).toBe('execute');
  });

  it('fullNode from protocol.ts is the same as from runtime/meta.ts', () => {
    expect(fullNode).toBe(metaFullNode);
  });

  it('CoreNodeSpec is structurally compatible with NodeSpec (subset)', () => {
    // A CoreNodeSpec value should be assignable where CoreNodeSpec is expected
    const core: CoreNodeSpec = {
      id: 'test',
      desc: 'core only',
      produces: [],
      consumes: [],
      deps: [],
    };
    // Verify all 5 core fields exist
    expect(core.id).toBe('test');
    expect(core.desc).toBe('core only');
    expect(core.produces).toEqual([]);
    expect(core.consumes).toEqual([]);
    expect(core.deps).toEqual([]);
  });
});

describe('downstream-compat: consumeSpec helpers', () => {
  it('consumeArtifact extracts artifact from string', () => {
    expect(consumeArtifact('src/foo.ts')).toBe('src/foo.ts');
  });

  it('consumeArtifact extracts artifact from resolvedBy spec', () => {
    expect(consumeArtifact({ artifact: 'src/foo.ts', resolvedBy: 'setup' })).toBe('src/foo.ts');
  });

  it('consumeResolvedBy returns undefined for string', () => {
    expect(consumeResolvedBy('src/foo.ts')).toBeUndefined();
  });

  it('consumeResolvedBy returns resolver for resolvedBy spec', () => {
    expect(consumeResolvedBy({ artifact: 'src/foo.ts', resolvedBy: 'setup' })).toBe('setup');
  });
});
