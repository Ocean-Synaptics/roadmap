// @module receipt-first/scenario-registry
// @exports ScenarioDef, ScenarioRegistry, loadScenarios, findScenario, isGated
// @types ScenarioDef, ScenarioRegistry
// @entry roadmap

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScenarioDef {
  id: string;
  desc: string;
  requiredReceipts: Array<{
    type: 'cmd' | 'breakglass' | 'dispatch';
    cmd?: string;
    batchId?: string;
    matchHeadSha?: boolean;
  }>;
  allowBreakglass: boolean;
}

export interface ScenarioRegistry {
  schema_version: 1;
  scenarios: ScenarioDef[];
}

// ── Paths ────────────────────────────────────────────────────────────────────

const SCENARIOS_PATH = '.roadmap/scenarios/SCENARIOS.json';

// ── Core ─────────────────────────────────────────────────────────────────────

/** Load registry from .roadmap/scenarios/SCENARIOS.json. Returns empty registry if not found. */
export function loadScenarios(repoRoot: string): ScenarioRegistry {
  const path = join(repoRoot, SCENARIOS_PATH);
  if (!existsSync(path)) return { schema_version: 1, scenarios: [] };
  return JSON.parse(readFileSync(path, 'utf-8')) as ScenarioRegistry;
}

/** Find a scenario by ID. Returns null if not found. */
export function findScenario(registry: ScenarioRegistry, id: string): ScenarioDef | null {
  return registry.scenarios.find(s => s.id === id) ?? null;
}

/** True if registry has at least one scenario that gates the given command. */
export function isGated(registry: ScenarioRegistry, cmd: string): boolean {
  return registry.scenarios.some(s =>
    s.requiredReceipts.some(r => r.type === 'cmd' && r.cmd === cmd),
  );
}
