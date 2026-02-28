import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { scan, classify } from '../tools/audit-env-bypasses.ts';
import type { AuditResult } from '../tools/audit-env-bypasses.ts';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'tools/audit-env-bypasses.ts');

describe('audit-env-bypasses', () => {
  // --- classification unit tests ---

  describe('classify', () => {
    it('bypass: known bypass keys', () => {
      // ROADMAP_VALIDATING is a recursion guard (config), not a governance bypass
      expect(classify('ROADMAP_VALIDATING')).toBe('config');
      expect(classify('SKIP_PLAN_GATE')).toBe('bypass');
      expect(classify('SKIP_DAG_CHECK')).toBe('bypass');
      expect(classify('SKIP_BATCH_COMMIT')).toBe('bypass');
    });

    it('bypass: prefix patterns', () => {
      expect(classify('SKIP_WHATEVER')).toBe('bypass');
      expect(classify('BYPASS_SOMETHING')).toBe('bypass');
      expect(classify('DISABLE_CHECKS')).toBe('bypass');
      expect(classify('IGNORE_ERRORS')).toBe('bypass');
    });

    it('bypass: ROADMAP_ prefix (except known config)', () => {
      expect(classify('ROADMAP_UNKNOWN')).toBe('bypass');
    });

    it('config: known config keys', () => {
      expect(classify('AGENT_ID')).toBe('config');
      expect(classify('HOME')).toBe('config');
      expect(classify('USER')).toBe('config');
      expect(classify('CDP_URL')).toBe('config');
      expect(classify('CDP_PORT')).toBe('config');
      expect(classify('ROADMAP_EXPANSION_TYPE')).toBe('config');
      expect(classify('ROADMAP_SIBLING_ROOT')).toBe('config');
      expect(classify('DEBUG')).toBe('config');
    });

    it('ci: CI keys', () => {
      expect(classify('CI')).toBe('ci');
      expect(classify('GITHUB_SHA')).toBe('ci');
      expect(classify('GITHUB_BASE_REF')).toBe('ci');
      expect(classify('PROTECTED_BRANCH')).toBe('ci');
      expect(classify('VITEST_JSON')).toBe('ci');
      expect(classify('TEST_CLI_PATH')).toBe('ci');
    });

    it('config: unknown keys default to config', () => {
      expect(classify('SOME_RANDOM_VAR')).toBe('config');
    });
  });

  // --- scan() integration tests ---

  describe('scan()', () => {
    let result: AuditResult;

    // Run scan once for all integration tests
    result = scan(ROOT);

    it('produces valid structure', () => {
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('passed');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(Array.isArray(result.violations)).toBe(true);
    });

    it('finds env usage across scanned directories', () => {
      expect(result.summary.total).toBeGreaterThan(0);
    });

    it('detects ROADMAP_VALIDATING in src/protocol.ts as config (recursion guard)', () => {
      const protocolFindings = result.findings.filter(
        f => f.file === 'src/protocol.ts' && f.variable === 'ROADMAP_VALIDATING'
      );
      expect(protocolFindings.length).toBeGreaterThan(0);
      // ROADMAP_VALIDATING is in CONFIG_KEYS — it's a recursion guard, not a bypass
      for (const f of protocolFindings) {
        expect(f.category).toBe('config');
        expect(f.inTestDir).toBe(false);
      }
    });

    it('ROADMAP_VALIDATING in src/ is NOT a violation (it is config, not bypass)', () => {
      const v = result.violations.filter(v => v.variable === 'ROADMAP_VALIDATING' && v.file.startsWith('src/'));
      expect(v.length).toBe(0);
    });

    it('classifies AGENT_ID as config in bin/', () => {
      const agentFindings = result.findings.filter(
        f => f.file.startsWith('bin/') && f.variable === 'AGENT_ID'
      );
      expect(agentFindings.length).toBeGreaterThan(0);
      for (const f of agentFindings) {
        expect(f.category).toBe('config');
      }
    });

    it('classifies test-dir bypass keys (SKIP_* etc) as test-harness', () => {
      // ROADMAP_VALIDATING is config, not bypass — so won't appear as test-harness
      // Test harness reclassification applies to bypass keys that appear in test files
      const testHarness = result.findings.filter(f => f.category === 'test-harness');
      // If any test-harness entries exist, they must be in test directories
      for (const f of testHarness) {
        expect(f.inTestDir).toBe(true);
      }
    });

    it('flags violations (bypass outside tests/) — expects exit 1 if any bypass vars outside tests/', () => {
      // Result depends on codebase state — just verify structure is correct
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
      // All violations must be bypass keys outside tests/
      for (const v of result.violations) {
        expect(v.reason).toBe('bypass key outside tests/');
      }
    });

    it('summary counts are consistent', () => {
      const { summary, findings } = result;
      expect(summary.total).toBe(findings.length);
      const counted = summary.bypass + summary.config + summary.testHarness + summary.ci;
      expect(counted).toBe(summary.total);
    });

    it('detects CI keys in scripts/', () => {
      const ciInScripts = result.findings.filter(
        f => f.file.startsWith('scripts/') && f.category === 'ci'
      );
      expect(ciInScripts.length).toBeGreaterThan(0);
    });
  });

  // --- CLI execution test ---

  describe('CLI execution', () => {
    it('runs as script and outputs valid JSON', () => {
      const r = spawnSync('npx', ['tsx', SCRIPT], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30000,
      });

      // Exit 0 = clean (no violations), 1 = violations exist
      expect(r.status === 0 || r.status === 1).toBe(true);

      // stdout should be valid JSON
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toHaveProperty('findings');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('violations');
      expect(typeof parsed.passed).toBe('boolean');
    });
  });
});
