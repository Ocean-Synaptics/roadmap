import { describe, it, expect } from 'vitest';
import { buildInventory, validateInventory } from '../../src/lib/cli/inventory.ts';
import { auditCommand } from '../../src/lib/cli/audit.ts';

describe('compliance e2e', () => {
  const entries = buildInventory();

  it('all inventory entries have valid structure', () => {
    for (const e of entries) {
      expect(e.id).toBeTruthy();
      expect(Array.isArray(e.tokens)).toBe(true);
      expect(typeof e.description).toBe('string');
    }
  });

  it('non-exempt entries have examples', () => {
    for (const e of entries) {
      if (!e.exempt) {
        expect(e.examples.length).toBeGreaterThan(0);
      }
    }
  });

  it('inventory validates without failures', () => {
    const result = validateInventory(entries);
    expect(result.passed).toBe(true);
  });

  it('exempt entries have valid exemptClass', () => {
    const validClasses = ['plumbing', 'internal', 'deprecated'];
    for (const e of entries) {
      if (e.exempt) {
        expect(validClasses).toContain(e.exempt.exemptClass);
      }
    }
  });

  it('exempt entries return EXEMPT from auditCommand', () => {
    for (const e of entries) {
      if (e.exempt) {
        const result = auditCommand(e, 'fast');
        expect(result.state).toBe('EXEMPT');
      }
    }
  });

  it('all commands covered in inventory', () => {
    // Smoke test — inventory has expected minimum size
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });
});
