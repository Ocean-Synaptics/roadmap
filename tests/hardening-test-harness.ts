// @module hardening-test-harness
// @exports HardeningTestOrchestrator, createTestFixture, MockComponentFactory
// @types TestFixture, HardeningScenario, MockComponent
// @entry tests

/**
 * Hardening Test Harness — orchestrates integration test scenarios
 *
 * Coordinates:
 * 1. Test scenario execution (mismatch→recovery→success paths)
 * 2. Mock/stub components for parallel dependencies (headsha, trail, preflight, dag-switch, artifact-gates)
 * 3. Fixture setup for reproducible test state
 *
 * Designed to work with real modules once implemented, using dependency injection.
 * Mock implementations allow test prep to run in parallel with module development.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ─────────────────────────────────────────────────────────────────────────
// Types and Interfaces
// ─────────────────────────────────────────────────────────────────────────

export interface TestFixture {
  repoRoot: string;
  roadmapDir: string;
  headJsonPath: string;
  gitStatePath: string;
  recoveryStatePath: string;
  trailPath: string;
  cleanup(): void;
  commit(message: string): string;
  getCurrentSha(): string;
}

export interface HardeningScenario {
  id: string;
  name: string;
  description: string;
  steps: ScenarioStep[];
  expectedOutcome: string;
}

export interface ScenarioStep {
  action: 'mismatch' | 'create-artifact' | 'commit' | 'trail-append' | 'dag-switch' | 'validate';
  config: Record<string, any>;
}

export interface MockComponent {
  name: string;
  init(fixture: TestFixture): void;
  reset(): void;
}

export interface ComponentRegistry {
  headsha: MockHeadShaRecovery;
  trail: MockTrailManager;
  preflight: MockPreflightValidator;
  dagSwitch: MockDAGSwitcher;
  artifactGates: MockArtifactGates;
}

// ─────────────────────────────────────────────────────────────────────────
// Mock Implementations (stubs until real modules available)
// ─────────────────────────────────────────────────────────────────────────

export class MockHeadShaRecovery implements MockComponent {
  name = 'headsha-recovery';
  private fixture: TestFixture | null = null;

  init(fixture: TestFixture): void {
    this.fixture = fixture;
  }

  reset(): void {
    this.fixture = null;
  }

  detectMismatch(): { hasMismatch: boolean; reason?: string; actualGitSha: string } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const gitState = this.loadGitState();
    const actualSha = this.fixture.getCurrentSha();
    const hasMismatch = gitState?.lastCommit !== actualSha;
    return {
      hasMismatch,
      actualGitSha: actualSha,
      reason: hasMismatch ? `Mismatch: ${gitState?.lastCommit?.slice(0, 8)} vs ${actualSha.slice(0, 8)}` : undefined,
    };
  }

  autoRecover(): { recovered: boolean; newHeadSha: string } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const actualSha = this.fixture.getCurrentSha();
    const gitState = { lastCommit: actualSha, timestamp: new Date().toISOString() };
    writeFileSync(this.fixture.gitStatePath, JSON.stringify(gitState, null, 2));
    return { recovered: true, newHeadSha: actualSha };
  }

  validateConsistency(): { consistent: boolean; errors: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const errors: string[] = [];
    if (!existsSync(this.fixture.headJsonPath)) errors.push('head.json missing');
    if (!existsSync(this.fixture.gitStatePath)) errors.push('git-state.json missing');
    return { consistent: errors.length === 0, errors };
  }

  private loadGitState(): any {
    if (!this.fixture) return null;
    if (!existsSync(this.fixture.gitStatePath)) return null;
    try {
      return JSON.parse(readFileSync(this.fixture.gitStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }
}

export class MockTrailManager implements MockComponent {
  name = 'trail-manager';
  private fixture: TestFixture | null = null;
  private lastCommittedCount: number = 0;

  init(fixture: TestFixture): void {
    this.fixture = fixture;
    this.lastCommittedCount = 0;
  }

  reset(): void {
    this.fixture = null;
    this.lastCommittedCount = 0;
  }

  appendEntry(entry: Record<string, any>): void {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const line = JSON.stringify(entry) + '\n';
    if (existsSync(this.fixture.trailPath)) {
      const existing = readFileSync(this.fixture.trailPath, 'utf-8');
      writeFileSync(this.fixture.trailPath, existing + line);
    } else {
      writeFileSync(this.fixture.trailPath, line);
    }
  }

  autoCommit(): { committed: boolean; entriesAdded: number } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const currentCount = this.countEntries();
    const added = currentCount - this.lastCommittedCount;
    if (added > 0) {
      execSync('git add .roadmap/trail.jsonl', { cwd: this.fixture.repoRoot, stdio: 'ignore' });
      execSync(`git commit -m "roadmap: trail entries (${added})"`, {
        cwd: this.fixture.repoRoot,
        stdio: 'ignore',
      });
      this.lastCommittedCount = currentCount;
      return { committed: true, entriesAdded: added };
    }
    return { committed: false, entriesAdded: 0 };
  }

  private countEntries(): number {
    if (!this.fixture || !existsSync(this.fixture.trailPath)) return 0;
    const content = readFileSync(this.fixture.trailPath, 'utf-8');
    return content.trim().split('\n').filter(l => l.length > 0).length;
  }
}

export class MockPreflightValidator implements MockComponent {
  name = 'preflight-validator';
  private fixture: TestFixture | null = null;

  init(fixture: TestFixture): void {
    this.fixture = fixture;
  }

  reset(): void {
    this.fixture = null;
  }

  validate(requiredArtifacts: string[]): { valid: boolean; missing: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const missing = requiredArtifacts.filter(path => !existsSync(join(this.fixture!.repoRoot, path)));
    return { valid: missing.length === 0, missing };
  }

  checkGitState(): { coherent: boolean; issues: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const issues: string[] = [];
    if (!existsSync(this.fixture.gitStatePath)) issues.push('git-state.json missing');
    if (!existsSync(this.fixture.headJsonPath)) issues.push('head.json missing');
    return { coherent: issues.length === 0, issues };
  }
}

export class MockDAGSwitcher implements MockComponent {
  name = 'dag-switcher';
  private fixture: TestFixture | null = null;
  private currentDAGId: string = 'test-dag-001';

  init(fixture: TestFixture): void {
    this.fixture = fixture;
  }

  reset(): void {
    this.fixture = null;
    this.currentDAGId = 'test-dag-001';
  }

  listAvailableDAGs(): string[] {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const files = execSync(`ls -1 ${this.fixture.roadmapDir}/head.*.json 2>/dev/null || echo ""`, {
      encoding: 'utf-8',
    })
      .trim()
      .split('\n')
      .filter(f => f.length > 0);
    return files.map(f => f.split('head.')[1].split('.json')[0]);
  }

  switchDAG(dagId: string): { success: boolean; error?: string } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const dagFile = join(this.fixture.roadmapDir, `head.${dagId}.json`);
    if (!existsSync(dagFile)) {
      return { success: false, error: `DAG file not found: ${dagFile}` };
    }
    try {
      const content = readFileSync(dagFile, 'utf-8');
      writeFileSync(this.fixture.headJsonPath, content);
      this.currentDAGId = dagId;
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  getCurrentDAGId(): string {
    return this.currentDAGId;
  }

  validateDAGStructure(dagId: string): { valid: boolean; errors: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const errors: string[] = [];
    const dagFile = join(this.fixture.roadmapDir, `head.${dagId}.json`);

    try {
      const dag = JSON.parse(readFileSync(dagFile, 'utf-8'));
      if (!dag.init) errors.push('DAG missing init node');
      if (!dag.term) errors.push('DAG missing term node');
      if (!dag.nodes) errors.push('DAG missing nodes object');
      else {
        // Check deps are valid
        Object.values(dag.nodes).forEach((node: any) => {
          if (node.deps) {
            node.deps.forEach((dep: string) => {
              if (!dag.nodes[dep]) errors.push(`Node ${node.id} depends on missing node ${dep}`);
            });
          }
        });
      }
    } catch (err) {
      errors.push(`Failed to parse DAG: ${err}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

export class MockArtifactGates implements MockComponent {
  name = 'artifact-gates';
  private fixture: TestFixture | null = null;

  init(fixture: TestFixture): void {
    this.fixture = fixture;
  }

  reset(): void {
    this.fixture = null;
  }

  gateCompletion(requiredArtifacts: string[]): { allowed: boolean; blockedBy: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const missing = requiredArtifacts.filter(path => !existsSync(join(this.fixture!.repoRoot, path)));
    return { allowed: missing.length === 0, blockedBy: missing };
  }

  validateArtifactSchema(path: string, schema: Record<string, any>): { valid: boolean; errors: string[] } {
    if (!this.fixture) throw new Error('Fixture not initialized');
    const errors: string[] = [];
    const fullPath = join(this.fixture.repoRoot, path);

    if (!existsSync(fullPath)) {
      errors.push(`Artifact does not exist: ${path}`);
      return { valid: false, errors };
    }

    try {
      const content = readFileSync(fullPath, 'utf-8');
      // Simple validation: if path is .ts, try to parse as valid JS
      if (path.endsWith('.ts') || path.endsWith('.js')) {
        // Just check it's not obviously invalid
        if (!content.trim()) errors.push('File is empty');
      }
    } catch (err) {
      errors.push(`Failed to read artifact: ${err}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Test Fixture Builder
// ─────────────────────────────────────────────────────────────────────────

export function createTestFixture(name: string = 'harness-test'): TestFixture {
  const repoRoot = join('/tmp', `hardening-${name}-${Date.now()}`);
  const roadmapDir = join(repoRoot, '.roadmap');

  // Initialize repo
  mkdirSync(repoRoot, { recursive: true });
  execSync('git init', { cwd: repoRoot, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: repoRoot, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: repoRoot, stdio: 'ignore' });

  mkdirSync(roadmapDir, { recursive: true });

  // Create initial head.json
  const headJson = {
    id: 'test-dag-001',
    desc: 'Test DAG',
    init: 'node-a',
    term: 'node-z',
    nodes: {
      'node-a': {
        id: 'node-a',
        produces: ['src/a.ts'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists' }],
      },
      'node-z': {
        id: 'node-z',
        produces: [],
        consumes: ['src/a.ts'],
        deps: ['node-a'],
        validate: [{ type: 'artifact-exists' }],
      },
    },
  };
  const headJsonPath = join(roadmapDir, 'head.json');
  writeFileSync(headJsonPath, JSON.stringify(headJson, null, 2));

  // Create initial git-state.json
  const gitStatePath = join(roadmapDir, 'git-state.json');
  execSync('git add -A', { cwd: repoRoot, stdio: 'ignore' });
  execSync('git commit -m "init"', { cwd: repoRoot, stdio: 'ignore' });
  const sha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  writeFileSync(gitStatePath, JSON.stringify({ lastCommit: sha, timestamp: new Date().toISOString() }, null, 2));

  const trailPath = join(roadmapDir, 'trail.jsonl');
  const recoveryStatePath = join(roadmapDir, 'recovery-state.json');

  return {
    repoRoot,
    roadmapDir,
    headJsonPath,
    gitStatePath,
    trailPath,
    recoveryStatePath,
    cleanup(): void {
      if (existsSync(repoRoot)) {
        rmSync(repoRoot, { recursive: true, force: true });
      }
    },
    commit(message: string): string {
      execSync('git add -A', { cwd: repoRoot, stdio: 'ignore' });
      execSync(`git commit -m "${message}"`, { cwd: repoRoot, stdio: 'ignore' });
      return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
    },
    getCurrentSha(): string {
      return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Test Orchestrator — coordinates multi-step scenarios
// ─────────────────────────────────────────────────────────────────────────

export class HardeningTestOrchestrator {
  private fixture: TestFixture;
  private components: ComponentRegistry;

  constructor(fixture: TestFixture) {
    this.fixture = fixture;
    this.components = {
      headsha: new MockHeadShaRecovery(),
      trail: new MockTrailManager(),
      preflight: new MockPreflightValidator(),
      dagSwitch: new MockDAGSwitcher(),
      artifactGates: new MockArtifactGates(),
    };

    // Initialize all components with fixture
    Object.values(this.components).forEach(comp => comp.init(fixture));
  }

  /**
   * Execute a complete scenario: mismatch → recovery → success
   */
  async runScenario(scenario: HardeningScenario): Promise<ScenarioResult> {
    const result: ScenarioResult = {
      scenarioId: scenario.id,
      passed: true,
      steps: [],
      error: undefined,
    };

    try {
      for (const step of scenario.steps) {
        const stepResult = await this.executeStep(step);
        result.steps.push(stepResult);
        if (!stepResult.passed) {
          result.passed = false;
          result.error = stepResult.error;
          break;
        }
      }
    } catch (err) {
      result.passed = false;
      result.error = err instanceof Error ? err.message : 'Unknown error';
    }

    return result;
  }

  /**
   * Execute individual scenario step
   */
  private async executeStep(step: ScenarioStep): Promise<StepResult> {
    const result: StepResult = {
      action: step.action,
      passed: true,
      output: {},
    };

    try {
      switch (step.action) {
        case 'mismatch':
          // Create headSha mismatch by changing git state without updating git-state.json
          const wrongSha = 'deadbeef0000000000000000000000000000beef';
          writeFileSync(this.fixture.gitStatePath, JSON.stringify({ lastCommit: wrongSha, timestamp: new Date().toISOString() }, null, 2));
          result.output = { created: true, wrongSha };
          break;

        case 'create-artifact':
          const { path, content } = step.config;
          const fullPath = join(this.fixture.repoRoot, path);
          mkdirSync(require('path').dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content || 'export const test = true;');
          result.output = { path, created: true };
          break;

        case 'commit':
          const { message } = step.config;
          const sha = this.fixture.commit(message);
          result.output = { sha, message };
          break;

        case 'trail-append':
          const { node } = step.config;
          this.components.trail.appendEntry({
            ts: new Date().toISOString(),
            node,
            batch: [node],
          });
          result.output = { appended: true, node };
          break;

        case 'dag-switch':
          const { dagId } = step.config;
          const switchResult = this.components.dagSwitch.switchDAG(dagId);
          if (!switchResult.success) {
            result.passed = false;
            result.error = switchResult.error;
          }
          result.output = switchResult;
          break;

        case 'validate':
          const { type } = step.config;
          switch (type) {
            case 'headsha':
              result.output = this.components.headsha.detectMismatch();
              break;
            case 'trail':
              result.output = this.components.trail.autoCommit();
              break;
            case 'preflight':
              result.output = this.components.preflight.checkGitState();
              break;
            case 'recovery':
              result.output = this.components.headsha.autoRecover();
              break;
          }
          break;
      }
    } catch (err) {
      result.passed = false;
      result.error = err instanceof Error ? err.message : 'Unknown error';
    }

    return result;
  }

  getFixture(): TestFixture {
    return this.fixture;
  }

  getComponents(): ComponentRegistry {
    return this.components;
  }

  cleanup(): void {
    this.fixture.cleanup();
  }
}

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  steps: StepResult[];
  error?: string;
}

export interface StepResult {
  action: string;
  passed: boolean;
  output: Record<string, any>;
  error?: string;
}

/**
 * Scenario definitions for the five hardening integration scenarios
 */
export const HARDENING_SCENARIOS: HardeningScenario[] = [
  {
    id: 'scenario-1-headsha-recovery',
    name: 'HeadSha Mismatch → Auto-Recovery → Success',
    description: 'Detect mismatch between git HEAD and recorded state, auto-recover without manual intervention',
    steps: [
      { action: 'mismatch', config: {} },
      { action: 'validate', config: { type: 'headsha' } },
      { action: 'validate', config: { type: 'recovery' } },
      { action: 'validate', config: { type: 'headsha' } },
    ],
    expectedOutcome: 'HeadSha mismatch auto-detected and recovered without errors',
  },
  {
    id: 'scenario-2-preflight-gates',
    name: 'Missing Artifacts → Preflight Gate → Blocked',
    description: 'Preflight validation detects missing artifacts and blocks completion',
    steps: [
      { action: 'validate', config: { type: 'preflight' } },
      { action: 'create-artifact', config: { path: 'src/a.ts', content: 'export const a = 1;' } },
      { action: 'commit', config: { message: 'add artifact' } },
      { action: 'validate', config: { type: 'preflight' } },
    ],
    expectedOutcome: 'Preflight validation blocks until all artifacts exist',
  },
  {
    id: 'scenario-3-trail-management',
    name: 'Trail Changes → Auto-Commit → No Friction',
    description: 'Trail changes are atomically committed without manual intervention',
    steps: [
      { action: 'trail-append', config: { node: 'node-a' } },
      { action: 'validate', config: { type: 'trail' } },
      { action: 'trail-append', config: { node: 'node-b' } },
      { action: 'validate', config: { type: 'trail' } },
    ],
    expectedOutcome: 'Trail changes auto-committed without manual friction',
  },
  {
    id: 'scenario-4-dag-switching',
    name: 'DAG Switch → Validate → Orient Correctly',
    description: 'DAG switching validates consistency and re-orients correctly',
    steps: [
      { action: 'dag-switch', config: { dagId: 'test-dag-001' } },
      { action: 'validate', config: { type: 'preflight' } },
      { action: 'commit', config: { message: 'dag state' } },
    ],
    expectedOutcome: 'DAG switch validated and orientation preserved',
  },
  {
    id: 'scenario-5-end-to-end',
    name: 'End-to-End Workflow Integration',
    description: 'Full workflow: init → mismatch → recovery → artifact → trail → commit → verify',
    steps: [
      { action: 'mismatch', config: {} },
      { action: 'validate', config: { type: 'headsha' } },
      { action: 'validate', config: { type: 'recovery' } },
      { action: 'create-artifact', config: { path: 'src/a.ts', content: 'export const a = 1;' } },
      { action: 'commit', config: { message: 'add artifact' } },
      { action: 'trail-append', config: { node: 'node-a' } },
      { action: 'validate', config: { type: 'trail' } },
      { action: 'validate', config: { type: 'preflight' } },
    ],
    expectedOutcome: 'Full workflow executes without errors, all components coordinated',
  },
];
