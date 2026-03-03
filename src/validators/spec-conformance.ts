// @module validators/spec-conformance
// @exports SpecScenario, ScenarioMapping, ConformanceResult, parseScenarios, mapScenarioToNodes, validateConformance, conformanceValidator
// @types SpecScenario, ScenarioMapping, ConformanceResult
// @entry roadmap

import type { Graph, NodeSpec, ValidationRule } from '../lib/protocol/types.ts';
import { consumeArtifact } from '../lib/protocol/types.ts';

// --- Types ---

export interface SpecScenario {
  name: string;
  given: string;
  when: string;
  then: string;
  section?: string;
}

export interface ScenarioMapping {
  scenario: SpecScenario;
  nodeId: string;
  coverage: 'full' | 'partial' | 'missing';
}

export interface ConformanceResult {
  specId: string;
  totalScenarios: number;
  mapped: number;
  unmapped: SpecScenario[];
  partialMappings: ScenarioMapping[];
  conformant: boolean;
}

// --- Scenario Parser ---

const GIVEN_RE = /^\s*(?:Given|GIVEN)\s+(.+)/;
const WHEN_RE = /^\s*(?:When|WHEN)\s+(.+)/;
const THEN_RE = /^\s*(?:Then|THEN)\s+(.+)/;
const SCENARIO_RE = /^\s*(?:Scenario|SCENARIO)\s*:\s*(.+)/;
const SECTION_RE = /^#{1,4}\s+(.+)/;

/**
 * Extract Given/When/Then scenarios from spec markdown or structured text.
 * Supports two formats:
 *   1. Markdown with "Scenario: <name>" followed by Given/When/Then lines
 *   2. JSON array of SpecScenario objects
 */
export function parseScenarios(specContent: string): SpecScenario[] {
  const trimmed = specContent.trim();

  // JSON format
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidScenario);
    } catch {
      return [];
    }
  }

  // Markdown format
  const lines = specContent.split('\n');
  const scenarios: SpecScenario[] = [];
  let currentSection: string | undefined;
  let currentName: string | undefined;
  let given: string | undefined;
  let when: string | undefined;

  function flush(thenVal: string) {
    if (currentName && given && when) {
      scenarios.push({
        name: currentName,
        given,
        when,
        then: thenVal,
        ...(currentSection ? { section: currentSection } : {}),
      });
    }
    given = undefined;
    when = undefined;
  }

  for (const line of lines) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      continue;
    }

    const scenarioMatch = line.match(SCENARIO_RE);
    if (scenarioMatch) {
      currentName = scenarioMatch[1].trim();
      given = undefined;
      when = undefined;
      continue;
    }

    const givenMatch = line.match(GIVEN_RE);
    if (givenMatch) {
      given = givenMatch[1].trim();
      continue;
    }

    const whenMatch = line.match(WHEN_RE);
    if (whenMatch) {
      when = whenMatch[1].trim();
      continue;
    }

    const thenMatch = line.match(THEN_RE);
    if (thenMatch) {
      flush(thenMatch[1].trim());
      continue;
    }
  }

  return scenarios;
}

function isValidScenario(s: unknown): s is SpecScenario {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o['name'] === 'string' &&
    typeof o['given'] === 'string' &&
    typeof o['when'] === 'string' &&
    typeof o['then'] === 'string'
  );
}

// --- Node Mapper ---

/**
 * Score how well a node covers a scenario.
 * Checks: desc match, produces match, validate rules referencing the spec.
 */
function scoreNode(scenario: SpecScenario, node: NodeSpec<string>): number {
  let score = 0;
  const descLower = node.desc.toLowerCase();
  const keywords = extractKeywords(scenario);

  // Desc keyword overlap
  for (const kw of keywords) {
    if (descLower.includes(kw)) score += 1;
  }

  // Produces match: scenario "then" references an artifact the node produces
  const thenLower = scenario.then.toLowerCase();
  for (const p of node.produces) {
    const pLower = p.toLowerCase();
    // Check if produced artifact name overlaps with "then" clause
    const pBase = pLower.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    if (pBase && thenLower.includes(pBase)) score += 2;
  }

  // Validate rules: spec-conformance rules pointing at same spec
  for (const rule of node.validate) {
    if (rule.type === 'spec-conformance' && scenario.section) {
      score += 1;
    }
  }

  return score;
}

function extractKeywords(scenario: SpecScenario): string[] {
  const text = `${scenario.name} ${scenario.given} ${scenario.when} ${scenario.then}`;
  const stopwords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'that', 'this', 'it', 'its', 'not', 'no', 'if', 'then', 'when', 'given']);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));
}

/**
 * Map a scenario to the best-matching node(s) in a DAG.
 * Returns a single ScenarioMapping (best match or missing).
 */
export function mapScenarioToNodes<T extends string>(
  scenario: SpecScenario,
  dag: Graph<T>,
): ScenarioMapping {
  const nodeIds = Object.keys(dag.nodes) as T[];
  let bestId: string | null = null;
  let bestScore = 0;

  for (const id of nodeIds) {
    if (id === dag.init || id === dag.term) continue;
    const node = dag.nodes[id];
    const s = scoreNode(scenario, node);
    if (s > bestScore) {
      bestScore = s;
      bestId = id;
    }
  }

  if (!bestId || bestScore === 0) {
    return { scenario, nodeId: '', coverage: 'missing' };
  }

  // full = score >= 3 (desc + produces + validate match), partial = less
  const coverage = bestScore >= 3 ? 'full' : 'partial';
  return { scenario, nodeId: bestId, coverage };
}

/**
 * Full conformance check: parse scenarios from spec, map each to DAG nodes.
 */
export function validateConformance<T extends string>(
  specContent: string,
  dag: Graph<T>,
  specId?: string,
): ConformanceResult {
  const scenarios = parseScenarios(specContent);
  const mappings: ScenarioMapping[] = scenarios.map(s => mapScenarioToNodes(s, dag));

  const unmapped = mappings.filter(m => m.coverage === 'missing').map(m => m.scenario);
  const partial = mappings.filter(m => m.coverage === 'partial');
  const fullCount = mappings.filter(m => m.coverage === 'full').length;

  return {
    specId: specId ?? dag.id,
    totalScenarios: scenarios.length,
    mapped: fullCount + partial.length,
    unmapped,
    partialMappings: partial,
    conformant: unmapped.length === 0 && partial.length === 0 && scenarios.length > 0,
  };
}

// --- Pluggable Validator ---

/**
 * Create a ValidationRule for the roadmap validation stack.
 * When used in a node's validate array, checks that the spec at specPath
 * has all scenarios covered by DAG nodes.
 */
export function conformanceValidator(
  specPath: string,
  stories: number[] = [],
  criteria: number[] = [],
): ValidationRule {
  return {
    type: 'spec-conformance',
    spec: specPath,
    stories,
    ...(criteria.length > 0 ? { criteria } : {}),
  };
}

// --- Audit Integration ---

export interface ConformanceAuditEntry {
  type: 'spec-conformance';
  specId: string;
  totalScenarios: number;
  mapped: number;
  unmappedCount: number;
  unmappedNames: string[];
  conformant: boolean;
  timestamp: string;
}

/**
 * Convert a ConformanceResult to an audit-compatible entry.
 */
export function toAuditEntry(result: ConformanceResult): ConformanceAuditEntry {
  return {
    type: 'spec-conformance',
    specId: result.specId,
    totalScenarios: result.totalScenarios,
    mapped: result.mapped,
    unmappedCount: result.unmapped.length,
    unmappedNames: result.unmapped.map(s => s.name),
    conformant: result.conformant,
    timestamp: new Date().toISOString(),
  };
}
