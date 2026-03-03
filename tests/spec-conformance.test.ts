// @module spec-conformance-tests
// @purpose Unit tests for spec-conformance validator: scenario parsing, node mapping, conformance checking

import { describe, it, expect } from 'vitest';
import {
  parseScenarios,
  mapScenarioToNodes,
  validateConformance,
  conformanceValidator,
  toAuditEntry,
} from '../src/validators/spec-conformance.ts';
import type { SpecScenario } from '../src/validators/spec-conformance.ts';
import { graph } from '../src/lib/protocol/types.ts';

// --- Helpers ---

function makeDAG(nodes: Record<string, { desc: string; produces?: string[]; validate?: any[] }>) {
  const nodeSpecs: Record<string, any> = {
    init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
    term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: Object.keys(nodes), validate: [], idempotent: true },
  };
  for (const [id, n] of Object.entries(nodes)) {
    nodeSpecs[id] = {
      id,
      desc: n.desc,
      produces: n.produces ?? [],
      consumes: [],
      deps: ['init'],
      validate: n.validate ?? [],
      idempotent: true,
    };
  }
  return graph({
    id: 'test-dag',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: nodeSpecs as any,
  });
}

const SPEC_MARKDOWN = `
# Authentication

## Login

Scenario: User logs in with valid credentials
Given a registered user
When the user submits valid credentials
Then the user receives an auth token

Scenario: User logs in with invalid credentials
Given a registered user
When the user submits invalid credentials
Then the user receives an error message

## Token Refresh

Scenario: Token refresh with valid refresh token
Given an authenticated user with expired access token
When the refresh endpoint is called with valid refresh token
Then a new access token is issued
`;

const SPEC_JSON = JSON.stringify([
  { name: 'Create item', given: 'an empty list', when: 'user creates an item', then: 'item appears in list' },
  { name: 'Delete item', given: 'a list with one item', when: 'user deletes the item', then: 'list is empty' },
]);

// --- Tests ---

describe('parseScenarios', () => {
  it('extracts scenarios from markdown', () => {
    const scenarios = parseScenarios(SPEC_MARKDOWN);
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].name).toBe('User logs in with valid credentials');
    expect(scenarios[0].given).toBe('a registered user');
    expect(scenarios[0].when).toBe('the user submits valid credentials');
    expect(scenarios[0].then).toBe('the user receives an auth token');
  });

  it('captures section headings', () => {
    const scenarios = parseScenarios(SPEC_MARKDOWN);
    expect(scenarios[0].section).toBe('Login');
    expect(scenarios[2].section).toBe('Token Refresh');
  });

  it('parses JSON array format', () => {
    const scenarios = parseScenarios(SPEC_JSON);
    expect(scenarios).toHaveLength(2);
    expect(scenarios[0].name).toBe('Create item');
    expect(scenarios[1].then).toBe('list is empty');
  });

  it('returns empty for invalid JSON', () => {
    expect(parseScenarios('{ not an array }')).toEqual([]);
  });

  it('returns empty for empty string', () => {
    expect(parseScenarios('')).toEqual([]);
  });

  it('filters out invalid objects in JSON array', () => {
    const bad = JSON.stringify([
      { name: 'Valid', given: 'a', when: 'b', then: 'c' },
      { name: 'Missing fields' },
      42,
    ]);
    const scenarios = parseScenarios(bad);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].name).toBe('Valid');
  });

  it('handles scenario without preceding section', () => {
    const spec = `
Scenario: Standalone test
Given precondition
When action happens
Then result occurs
`;
    const scenarios = parseScenarios(spec);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].section).toBeUndefined();
  });
});

describe('mapScenarioToNodes', () => {
  it('maps scenario to node with matching desc keywords', () => {
    const dag = makeDAG({
      'auth-login': { desc: 'Implement user login with credentials and auth token generation' },
      'setup-db': { desc: 'Set up database schema' },
    });

    const scenario: SpecScenario = {
      name: 'User logs in',
      given: 'a registered user',
      when: 'the user submits valid credentials',
      then: 'the user receives an auth token',
    };

    const mapping = mapScenarioToNodes(scenario, dag);
    expect(mapping.nodeId).toBe('auth-login');
    expect(mapping.coverage).not.toBe('missing');
  });

  it('returns missing when no node matches', () => {
    const dag = makeDAG({
      'setup-db': { desc: 'Set up database schema' },
    });

    const scenario: SpecScenario = {
      name: 'Widget rendering',
      given: 'a widget component',
      when: 'the widget renders',
      then: 'pixels are painted correctly',
    };

    const mapping = mapScenarioToNodes(scenario, dag);
    expect(mapping.coverage).toBe('missing');
    expect(mapping.nodeId).toBe('');
  });

  it('scores higher when produces match then clause', () => {
    const dag = makeDAG({
      'gen-report': { desc: 'Generate report', produces: ['dist/report.html'] },
      'gen-data': { desc: 'Generate data files' },
    });

    const scenario: SpecScenario = {
      name: 'Report generation',
      given: 'processed data',
      when: 'report generation runs',
      then: 'report file is created',
    };

    const mapping = mapScenarioToNodes(scenario, dag);
    expect(mapping.nodeId).toBe('gen-report');
  });

  it('skips init and term nodes', () => {
    const dag = makeDAG({});
    const scenario: SpecScenario = { name: 'Test', given: 'start', when: 'end', then: 'done' };
    const mapping = mapScenarioToNodes(scenario, dag);
    expect(mapping.coverage).toBe('missing');
  });
});

describe('validateConformance', () => {
  it('reports full conformance when all scenarios mapped', () => {
    const dag = makeDAG({
      'auth-login': { desc: 'User login with credentials validation and auth token issuance' },
      'auth-error': { desc: 'Handle invalid credentials with error message for registered user' },
      'token-refresh': { desc: 'Refresh endpoint issues new access token using refresh token for authenticated user' },
    });

    const result = validateConformance(SPEC_MARKDOWN, dag);
    expect(result.totalScenarios).toBe(3);
    expect(result.unmapped).toHaveLength(0);
  });

  it('detects unmapped scenarios', () => {
    const dag = makeDAG({
      'setup-infra': { desc: 'Provision cloud infrastructure and networking' },
    });

    const result = validateConformance(SPEC_MARKDOWN, dag);
    expect(result.totalScenarios).toBe(3);
    expect(result.unmapped.length).toBeGreaterThan(0);
    expect(result.conformant).toBe(false);
  });

  it('returns non-conformant for empty spec', () => {
    const dag = makeDAG({ 'task-1': { desc: 'something' } });
    const result = validateConformance('', dag);
    expect(result.totalScenarios).toBe(0);
    expect(result.conformant).toBe(false);
  });

  it('uses custom specId when provided', () => {
    const dag = makeDAG({});
    const result = validateConformance('', dag, 'custom-spec');
    expect(result.specId).toBe('custom-spec');
  });

  it('defaults specId to dag id', () => {
    const dag = makeDAG({});
    const result = validateConformance('', dag);
    expect(result.specId).toBe('test-dag');
  });

  it('handles JSON spec input', () => {
    const dag = makeDAG({
      'list-ops': { desc: 'Create and delete items in the list', produces: ['src/list.ts'] },
    });

    const result = validateConformance(SPEC_JSON, dag);
    expect(result.totalScenarios).toBe(2);
  });
});

describe('conformanceValidator', () => {
  it('creates a spec-conformance ValidationRule', () => {
    const rule = conformanceValidator('spec/auth.md', [1, 2]);
    expect(rule).toEqual({
      type: 'spec-conformance',
      spec: 'spec/auth.md',
      stories: [1, 2],
    });
  });

  it('includes criteria when non-empty', () => {
    const rule = conformanceValidator('spec/auth.md', [1], [3, 4]);
    expect(rule).toEqual({
      type: 'spec-conformance',
      spec: 'spec/auth.md',
      stories: [1],
      criteria: [3, 4],
    });
  });

  it('omits criteria when empty', () => {
    const rule = conformanceValidator('spec/auth.md');
    expect(rule).not.toHaveProperty('criteria');
  });
});

describe('toAuditEntry', () => {
  it('converts ConformanceResult to audit entry', () => {
    const result = validateConformance(SPEC_MARKDOWN, makeDAG({}));
    const entry = toAuditEntry(result);
    expect(entry.type).toBe('spec-conformance');
    expect(entry.specId).toBe('test-dag');
    expect(entry.totalScenarios).toBe(3);
    expect(entry.unmappedCount).toBe(3);
    expect(entry.unmappedNames).toHaveLength(3);
    expect(entry.conformant).toBe(false);
    expect(entry.timestamp).toBeTruthy();
  });

  it('reports conformant when all mapped', () => {
    const dag = makeDAG({
      'auth-login': { desc: 'User login with credentials validation and auth token issuance' },
      'auth-error': { desc: 'Handle invalid credentials with error message for registered user' },
      'token-refresh': { desc: 'Refresh endpoint issues new access token using refresh token for authenticated user' },
    });
    const result = validateConformance(SPEC_MARKDOWN, dag);
    const entry = toAuditEntry(result);
    expect(entry.unmappedCount).toBe(0);
  });
});
