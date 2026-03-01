import { describe, it, expect } from 'vitest';
import { buildInventory } from '../../src/lib/cli/inventory.ts';

describe('exemptions', () => {
  const entries = buildInventory();
  const exemptEntries = entries.filter(e => e.exempt);

  it('exemptClass is valid enum value', () => {
    const validClasses = ['plumbing', 'internal', 'deprecated'];
    for (const e of exemptEntries) {
      expect(validClasses).toContain(e.exempt!.exemptClass);
    }
  });

  it('exemptReason is non-empty', () => {
    for (const e of exemptEntries) {
      expect(e.exempt!.exemptReason.length).toBeGreaterThan(0);
    }
  });

  it('exemption count capped at 10', () => {
    expect(exemptEntries.length).toBeLessThanOrEqual(10);
  });

  it('deprecated exemptions must have removalPlanNode', () => {
    for (const e of exemptEntries) {
      if (e.exempt!.exemptClass === 'deprecated') {
        expect(e.exempt!.removalPlanNode).toBeTruthy();
      }
    }
  });

  it('internal exemptions should have removalPlanNode when available', () => {
    // Soft check — not all internal need removalPlanNode yet
    for (const e of exemptEntries) {
      if (e.exempt!.exemptClass === 'internal' && e.exempt!.removalPlanNode) {
        expect(typeof e.exempt!.removalPlanNode).toBe('string');
      }
    }
  });

  it('no duplicate exemption IDs', () => {
    const ids = exemptEntries.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
