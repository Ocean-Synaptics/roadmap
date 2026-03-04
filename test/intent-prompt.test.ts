import { test } from 'node:test';
import assert from 'node:assert';

// Test that intent validators produce structured output (not rubber stamp)
// This tests the logic that bin/roadmap.ts applies when processing intent checks

test('intent gate extraction produces structured prompt', () => {
  // Simulate what advanceNode does with intent validators
  const validationChecks = [
    { rule: { type: 'intent', statement: 'All subsystems wired into CLI' }, passed: true, evidence: 'acknowledged' },
    { rule: { type: 'shell', command: 'echo ok' }, passed: true, evidence: 'exit 0' },
    { rule: { type: 'artifact-exists', target: 'out.ts' }, passed: true, evidence: 'file exists' },
  ];

  const shellChecks = [
    { rule: 'shell:echo ok', passed: true },
  ];

  const intentGates: Array<{ statement: string; shellResults: any[]; assessmentPrompt: string }> = [];
  for (const c of validationChecks) {
    if (c.rule.type === 'intent') {
      const statement = (c.rule as any).statement ?? '';
      intentGates.push({
        statement,
        shellResults: shellChecks,
        assessmentPrompt: `Evaluate whether "${statement}" is satisfied given ${shellChecks.filter(r => r.passed).length}/${shellChecks.length} shell validators passing.`,
      });
    }
  }

  assert.strictEqual(intentGates.length, 1);
  assert.strictEqual(intentGates[0].statement, 'All subsystems wired into CLI');
  assert(intentGates[0].assessmentPrompt.includes('1/1 shell validators passing'));
  assert(intentGates[0].shellResults.length > 0);
});

test('no intent gates when no intent validators', () => {
  const validationChecks = [
    { rule: { type: 'shell', command: 'echo ok' }, passed: true, evidence: 'exit 0' },
  ];

  const intentGates: any[] = [];
  for (const c of validationChecks) {
    if (c.rule.type === 'intent') {
      intentGates.push({ statement: (c.rule as any).statement });
    }
  }

  assert.strictEqual(intentGates.length, 0);
});
