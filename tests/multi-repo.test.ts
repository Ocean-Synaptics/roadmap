/**
 * Multi-repo coordination tests: verify merge correctness across multiple repos.
 */

import { describe, it, expect } from 'vitest';
import { graph, define, merge, check, verify, order, orient } from '../src/protocol';

describe('multi-repo patterns', () => {
  // Shared library: produces lib.js
  const shared = define(
    graph({
      id: 'shared',
      init: 'init',
      term: 'published',
      nodes: {
        init: { id: 'init', desc: '', produces: ['lib.ts'], consumes: [], deps: [], validate: [], idempotent: true },
        compile: { id: 'compile', desc: '', produces: ['lib.js'], consumes: ['lib.ts'], deps: ['init'], validate: [], idempotent: true },
        published: { id: 'published', desc: '', produces: [], consumes: ['lib.js'], deps: ['compile'], validate: [], idempotent: false },
      },
    }),
  );

  // Frontend: consumes lib.js, produces app.js
  const frontend = define(
    graph({
      id: 'frontend',
      init: 'setup',
      term: 'built',
      nodes: {
        setup: { id: 'setup', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        build: { id: 'build', desc: '', produces: ['app.js'], consumes: ['lib.js'], deps: ['setup'], validate: [], idempotent: true },
        built: { id: 'built', desc: '', produces: [], consumes: ['app.js'], deps: ['build'], validate: [], idempotent: false },
      },
    }),
  );

  // Backend: consumes lib.js, produces api.js
  const backend = define(
    graph({
      id: 'backend',
      init: 'setup',
      term: 'deployed',
      nodes: {
        setup: { id: 'setup', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        build: { id: 'build', desc: '', produces: ['api.js'], consumes: ['lib.js'], deps: ['setup'], validate: [], idempotent: true },
        deployed: { id: 'deployed', desc: '', produces: [], consumes: ['api.js'], deps: ['build'], validate: [], idempotent: false },
      },
    }),
  );

  it('merges shared → frontend', () => {
    const merged = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);

    // Should have all nodes from both graphs
    expect(Object.keys(merged.nodes)).toContain('init');
    expect(Object.keys(merged.nodes)).toContain('compile');
    expect(Object.keys(merged.nodes)).toContain('published');
    expect(Object.keys(merged.nodes)).toContain('setup');
    expect(Object.keys(merged.nodes)).toContain('build');
    expect(Object.keys(merged.nodes)).toContain('built');

    // shared.published → frontend.setup should have edge
    expect(merged.nodes['setup'].deps).toContain('published');

    // Should be valid
    expect(verify(merged)).toEqual([]);
    expect(check(merged).done).toBe(true);
  });

  it('merges shared → frontend → backend (two-level merge)', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);
    const step2 = merge(step1, backend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);

    // 3 graphs × ~3 nodes each = 9 nodes
    expect(Object.keys(step2.nodes).length).toBe(9);

    // Verify correctness
    expect(verify(step2)).toEqual([]);
    expect(check(step2).done).toBe(true);

    // Should reach terminal from init
    const ord = order(step2);
    expect(ord[0]).toBe('init');
    expect(ord[ord.length - 1]).toBe('deployed');
  });

  it('frontend and backend can execute in parallel after shared.published', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);
    const combined = merge(step1, backend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);

    const ord = order(combined);

    // Position of 'shared' nodes, frontend.setup, backend.setup
    const sharedPublished = ord.indexOf('published');
    const frontendSetup = ord.indexOf('setup'); // Note: there are two 'setup' nodes, this gets first
    const backendSetup = ord.indexOf('setup', frontendSetup + 1); // Get second 'setup'

    // After shared.published, both frontend.setup and backend.setup should be available
    expect(sharedPublished).toBeLessThan(frontendSetup);
    expect(sharedPublished).toBeLessThan(backendSetup);

    // frontend.build and backend.build both depend on lib.js (from shared.published)
    expect(combined.nodes['build']).toBeDefined(); // Will find first 'build'
  });

  it('orientation works across merged repos', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);
    const combined = merge(step1, backend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);

    // Simulate: all shared nodes done, frontend.setup in progress
    const exists = (path: string) => {
      return ['lib.ts', 'lib.js'].includes(path);
    };

    const pos = orient(combined, exists);

    // Should be at first incomplete node after shared phase
    expect(pos.complete).toBe(false);
    expect(pos.produces.length).toBeGreaterThan(0);
  });

  it('merge preserves init and term from both graphs', () => {
    const merged = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'setup', artifact: 'lib.js' }]);

    // init should be from shared (first graph)
    expect(merged.init).toBe('init');

    // term should be from frontend (second graph)
    expect(merged.term).toBe('built');
  });

  it('merge fails on node ID conflict', () => {
    // Create backend with conflicting node ID
    const conflicting = define(
      graph({
        id: 'conflict',
        init: 'init', // Same as shared.init
        term: 'done',
        nodes: {
          init: { id: 'init', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
          done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: false },
        },
      }),
    );

    expect(() => {
      merge(shared, conflicting, [{ g1Node: 'published', g2Node: 'init', artifact: 'lib.js' }]);
    }).toThrow();
  });
});
