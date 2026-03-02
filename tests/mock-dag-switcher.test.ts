import { describe, it, expect, beforeEach } from 'vitest';
import { MockDagSwitcher, switchDAG } from '../src/lib/roadmap/mocks/mock-dag-switcher.ts';

describe('MockDagSwitcher', () => {
  let mockSwitcher: MockDagSwitcher;

  beforeEach(() => {
    mockSwitcher = new MockDagSwitcher('/mock/repo');
  });

  describe('getCurrentDAG', () => {
    it('returns initial DAG ID', () => {
      const current = mockSwitcher.getCurrentDAG();
      expect(current).toBe('hardening-001');
    });
  });

  describe('getAvailableDAGs', () => {
    it('returns sample DAG list', () => {
      const available = mockSwitcher.getAvailableDAGs();
      expect(Array.isArray(available)).toBe(true);
      expect(available.length).toBeGreaterThan(0);
      expect(available).toContain('hardening-001');
    });

    it('returns sorted DAG list', () => {
      const available = mockSwitcher.getAvailableDAGs();
      const sorted = [...available].sort();
      expect(available).toEqual(sorted);
    });
  });

  describe('validateDAGExists', () => {
    it('returns true for existing DAG', () => {
      const exists = mockSwitcher.validateDAGExists('hardening-001');
      expect(exists).toBe(true);
    });

    it('returns false for non-existent DAG', () => {
      const exists = mockSwitcher.validateDAGExists('non-existent-dag');
      expect(exists).toBe(false);
    });
  });

  describe('switch', () => {
    it('switches to new DAG', async () => {
      const result = await mockSwitcher.switch('integration-suite');
      expect(result.switched).toBe(true);
      expect(result.dagId).toBe('integration-suite');
      expect(result.previousDagId).toBe('hardening-001');
    });

    it('updates current DAG after switch', async () => {
      await mockSwitcher.switch('phase-2');
      const current = mockSwitcher.getCurrentDAG();
      expect(current).toBe('phase-2');
    });

    it('returns proper SwitchResult structure', async () => {
      const result = await mockSwitcher.switch('phase-3');
      expect(typeof result.switched).toBe('boolean');
      expect(typeof result.dagId).toBe('string');
      expect(typeof result.previousDagId).toBe('string');
      expect(typeof result.dagPath).toBe('string');
      expect(typeof result.headPath).toBe('string');
      expect(result.newOrientation).toBeDefined();
    });

    it('returns valid orientation in switch result', async () => {
      const result = await mockSwitcher.switch('integration-suite');
      const orientation = result.newOrientation;
      expect(Array.isArray(orientation.position)).toBe(true);
      expect(typeof orientation.level).toBe('number');
      expect(Array.isArray(orientation.batchRemaining)).toBe(true);
      expect(typeof orientation.batchComplete).toBe('boolean');
      expect(Array.isArray(orientation.preGate)).toBe(true);
      expect(Array.isArray(orientation.produces)).toBe(true);
      expect(Array.isArray(orientation.consumes)).toBe(true);
    });
  });

  describe('standalone utilities', () => {
    it('switchDAG works as standalone function', async () => {
      const result = await switchDAG('/mock/repo', 'phase-2');
      expect(result.switched).toBe(true);
      expect(result.dagId).toBe('phase-2');
    });
  });

  describe('API signature alignment', () => {
    it('constructor accepts repoRoot string', () => {
      const switcher = new MockDagSwitcher('/some/path');
      expect(switcher).toBeDefined();
    });

    it('all methods are callable with correct signatures', async () => {
      const switcher = new MockDagSwitcher('/mock/repo');

      // getCurrentDAG() -> string | null
      const current = switcher.getCurrentDAG();
      expect(typeof current === 'string' || current === null).toBe(true);

      // getAvailableDAGs() -> string[]
      const available = switcher.getAvailableDAGs();
      expect(Array.isArray(available)).toBe(true);

      // validateDAGExists(dagId: string) -> boolean
      const exists = switcher.validateDAGExists('test');
      expect(typeof exists).toBe('boolean');

      // switch(dagId: string) -> Promise<SwitchResult>
      const switchResult = await switcher.switch('test-dag');
      expect(switchResult).toBeDefined();
      expect('switched' in switchResult).toBe(true);
    });
  });
});
