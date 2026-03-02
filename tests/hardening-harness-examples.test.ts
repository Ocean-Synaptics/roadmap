import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HardeningTestOrchestrator,
  createTestFixture,
  HARDENING_SCENARIOS,
  MockHeadShaRecovery,
  MockTrailManager,
  MockPreflightValidator,
  MockDAGSwitcher,
  MockArtifactGates,
} from './hardening-test-harness';

/**
 * Example usage of the hardening test harness
 * Demonstrates how to use mocks and orchestrator for each scenario
 */

describe('Hardening Test Harness Examples', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Example 1: Using individual mock components
  // ─────────────────────────────────────────────────────────────────────────
  describe('Individual Mock Components', () => {
    it('MockHeadShaRecovery detects and recovers from mismatch', () => {
      const fixture = createTestFixture('headsha-example');
      const mock = new MockHeadShaRecovery();
      mock.init(fixture);

      // Initially consistent
      const detection1 = mock.detectMismatch();
      expect(detection1.hasMismatch).toBe(false);

      // Introduce mismatch by corrupting git-state.json
      const wrongSha = 'deadbeef0000000000000000000000000000beef';
      const gitStateFile = fixture.gitStatePath;
      const fs = require('fs');
      fs.writeFileSync(gitStateFile, JSON.stringify({ lastCommit: wrongSha, timestamp: new Date().toISOString() }, null, 2));

      // Mismatch detected
      const detection2 = mock.detectMismatch();
      expect(detection2.hasMismatch).toBe(true);
      expect(detection2.reason).toContain('Mismatch');

      // Recover
      const recovery = mock.autoRecover();
      expect(recovery.recovered).toBe(true);

      // After recovery, no mismatch
      const detection3 = mock.detectMismatch();
      expect(detection3.hasMismatch).toBe(false);

      fixture.cleanup();
    });

    it('MockTrailManager appends entries and auto-commits', () => {
      const fixture = createTestFixture('trail-example');
      const mock = new MockTrailManager();
      mock.init(fixture);

      // Append entry
      mock.appendEntry({ ts: new Date().toISOString(), node: 'node-a', batch: ['node-a'] });

      // Auto-commit
      const result1 = mock.autoCommit();
      expect(result1.committed).toBe(true);
      expect(result1.entriesAdded).toBeGreaterThan(0);

      // Second commit with nothing new should not commit
      const result2 = mock.autoCommit();
      expect(result2.committed).toBe(false);

      fixture.cleanup();
    });

    it('MockPreflightValidator detects missing artifacts and checks git coherence', () => {
      const fixture = createTestFixture('preflight-example');
      const mock = new MockPreflightValidator();
      mock.init(fixture);

      // Git state should be coherent initially
      const gitCheck = mock.checkGitState();
      expect(gitCheck.coherent).toBe(true);

      // Artifacts missing initially
      const artifactCheck = mock.validate(['src/a.ts', 'src/b.ts']);
      expect(artifactCheck.valid).toBe(false);
      expect(artifactCheck.missing.length).toBeGreaterThan(0);

      // Create artifact
      const fs = require('fs');
      const path = require('path');
      const srcDir = path.join(fixture.repoRoot, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');

      // Now partial validation passes
      const artifactCheck2 = mock.validate(['src/a.ts']);
      expect(artifactCheck2.valid).toBe(true);

      fixture.cleanup();
    });

    it('MockDAGSwitcher switches DAGs and validates structure', () => {
      const fixture = createTestFixture('dag-switch-example');
      const mock = new MockDAGSwitcher();
      mock.init(fixture);

      // Current DAG should be test-dag-001
      expect(mock.getCurrentDAGId()).toBe('test-dag-001');

      // Validate current DAG structure
      const validation = mock.validateDAGStructure('test-dag-001');
      expect(validation.valid).toBe(true);

      // Try to switch to non-existent DAG should fail
      const switchResult = mock.switchDAG('non-existent-dag');
      expect(switchResult.success).toBe(false);

      fixture.cleanup();
    });

    it('MockArtifactGates gates completion on artifact existence', () => {
      const fixture = createTestFixture('gates-example');
      const mock = new MockArtifactGates();
      mock.init(fixture);

      // Initially blocked
      const gateCheck1 = mock.gateCompletion(['src/a.ts']);
      expect(gateCheck1.allowed).toBe(false);
      expect(gateCheck1.blockedBy.length).toBeGreaterThan(0);

      // Create artifact
      const fs = require('fs');
      const path = require('path');
      const srcDir = path.join(fixture.repoRoot, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');

      // Now allowed
      const gateCheck2 = mock.gateCompletion(['src/a.ts']);
      expect(gateCheck2.allowed).toBe(true);

      fixture.cleanup();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Example 2: Using the orchestrator for scenario-based testing
  // ─────────────────────────────────────────────────────────────────────────
  describe('Scenario-Based Orchestration', () => {
    it('runs the HeadSha recovery scenario', async () => {
      const fixture = createTestFixture('scenario-1');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[0]; // HeadSha recovery

      const result = await orchestrator.runScenario(scenario);

      expect(result.passed).toBe(true);
      expect(result.steps.length).toBe(scenario.steps.length);
      result.steps.forEach(step => {
        expect(step.passed).toBe(true);
      });

      orchestrator.cleanup();
    });

    it('runs the Preflight validation scenario', async () => {
      const fixture = createTestFixture('scenario-2');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[1]; // Preflight gates

      const result = await orchestrator.runScenario(scenario);

      expect(result.passed).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      orchestrator.cleanup();
    });

    it('runs the Trail management scenario', async () => {
      const fixture = createTestFixture('scenario-3');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[2]; // Trail management

      const result = await orchestrator.runScenario(scenario);

      expect(result.passed).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);

      orchestrator.cleanup();
    });

    it('runs the DAG switching scenario', async () => {
      const fixture = createTestFixture('scenario-4');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[3]; // DAG switching

      const result = await orchestrator.runScenario(scenario);

      expect(result.passed).toBe(true);

      orchestrator.cleanup();
    });

    it('runs the end-to-end workflow scenario', async () => {
      const fixture = createTestFixture('scenario-5');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[4]; // End-to-end

      const result = await orchestrator.runScenario(scenario);

      expect(result.passed).toBe(true);
      expect(result.steps.length).toBe(scenario.steps.length);

      orchestrator.cleanup();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Example 3: Custom test combining multiple components
  // ─────────────────────────────────────────────────────────────────────────
  describe('Multi-Component Coordination Examples', () => {
    it('coordinates HeadSha recovery + Trail management', async () => {
      const fixture = createTestFixture('multi-comp-example-1');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const components = orchestrator.getComponents();

      // Step 1: Introduce mismatch
      const fs = require('fs');
      const wrongSha = 'deadbeef0000000000000000000000000000beef';
      fs.writeFileSync(fixture.gitStatePath, JSON.stringify({ lastCommit: wrongSha, timestamp: new Date().toISOString() }, null, 2));

      // Step 2: Detect mismatch
      const mismatch = components.headsha.detectMismatch();
      expect(mismatch.hasMismatch).toBe(true);

      // Step 3: Recover
      const recovery = components.headsha.autoRecover();
      expect(recovery.recovered).toBe(true);

      // Step 4: Append trail entry for the recovery
      components.trail.appendEntry({
        ts: new Date().toISOString(),
        event: 'headsha-recovery',
        prevSha: wrongSha,
        newSha: recovery.newHeadSha,
      });

      // Step 5: Auto-commit trail
      const trailCommit = components.trail.autoCommit();
      expect(trailCommit.committed).toBe(true);

      // Step 6: Verify consistency
      const consistency = components.headsha.validateConsistency();
      expect(consistency.consistent).toBe(true);

      orchestrator.cleanup();
    });

    it('coordinates Preflight + Artifact Gates', async () => {
      const fixture = createTestFixture('multi-comp-example-2');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const components = orchestrator.getComponents();

      // Step 1: Check preflight (should fail - artifacts missing)
      const preflight1 = components.preflight.validate(['src/a.ts']);
      expect(preflight1.valid).toBe(false);

      // Step 2: Check artifact gates (should be blocked)
      const gates1 = components.artifactGates.gateCompletion(['src/a.ts']);
      expect(gates1.allowed).toBe(false);

      // Step 3: Create artifact
      const fs = require('fs');
      const path = require('path');
      const srcDir = path.join(fixture.repoRoot, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'a.ts'), 'export const a = 1;');
      fixture.commit('add a.ts');

      // Step 4: Check preflight (should pass)
      const preflight2 = components.preflight.validate(['src/a.ts']);
      expect(preflight2.valid).toBe(true);

      // Step 5: Check artifact gates (should be open)
      const gates2 = components.artifactGates.gateCompletion(['src/a.ts']);
      expect(gates2.allowed).toBe(true);

      orchestrator.cleanup();
    });

    it('coordinates DAG Switching + Preflight validation', async () => {
      const fixture = createTestFixture('multi-comp-example-3');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const components = orchestrator.getComponents();

      // Step 1: Validate current DAG structure
      const validation1 = components.dagSwitch.validateDAGStructure('test-dag-001');
      expect(validation1.valid).toBe(true);

      // Step 2: Check preflight before switch
      const preflight1 = components.preflight.checkGitState();
      expect(preflight1.coherent).toBe(true);

      // Step 3: Switch DAG (to same DAG for this example)
      const switchResult = components.dagSwitch.switchDAG('test-dag-001');
      expect(switchResult.success).toBe(true);

      // Step 4: Check preflight after switch (should still be coherent)
      const preflight2 = components.preflight.checkGitState();
      expect(preflight2.coherent).toBe(true);

      orchestrator.cleanup();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Example 4: Scenario execution with detailed assertions
  // ─────────────────────────────────────────────────────────────────────────
  describe('Detailed Scenario Assertions', () => {
    it('verifies scenario step outputs match expectations', async () => {
      const fixture = createTestFixture('detail-assertions');
      const orchestrator = new HardeningTestOrchestrator(fixture);
      const scenario = HARDENING_SCENARIOS[0]; // HeadSha recovery

      const result = await orchestrator.runScenario(scenario);

      // Verify scenario passed
      expect(result.passed).toBe(true);

      // Verify step 1: mismatch created
      expect(result.steps[0].action).toBe('mismatch');
      expect(result.steps[0].passed).toBe(true);

      // Verify step 2: mismatch detected
      expect(result.steps[1].action).toBe('validate');
      expect(result.steps[1].output).toHaveProperty('hasMismatch');

      // Verify step 3: recovery executed
      expect(result.steps[2].action).toBe('validate');
      expect(result.steps[2].passed).toBe(true);

      // Verify step 4: mismatch cleared
      expect(result.steps[3].action).toBe('validate');
      expect(result.steps[3].output).toHaveProperty('hasMismatch');
      expect(result.steps[3].output.hasMismatch).toBe(false);

      orchestrator.cleanup();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Example 5: Parallel scenario execution
  // ─────────────────────────────────────────────────────────────────────────
  describe('Parallel Scenario Execution', () => {
    it('executes all 5 scenarios in parallel', async () => {
      const orchestrators = HARDENING_SCENARIOS.map(scenario => ({
        orchestrator: new HardeningTestOrchestrator(createTestFixture(`parallel-${scenario.id}`)),
        scenario,
      }));

      const results = await Promise.all(
        orchestrators.map(({ orchestrator, scenario }) => orchestrator.runScenario(scenario))
      );

      // All scenarios should pass
      results.forEach((result, idx) => {
        expect(result.passed).toBe(true);
        expect(result.scenarioId).toBe(HARDENING_SCENARIOS[idx].id);
      });

      // Cleanup
      orchestrators.forEach(({ orchestrator }) => orchestrator.cleanup());
    });
  });
});
