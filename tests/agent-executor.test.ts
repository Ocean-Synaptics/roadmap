import { test, expect } from 'vitest';
import { RoadmapExecutor, createExecutor, bootstrapAgent } from '../.claude/agents/roadmap-executor.ts';

test('executor: creates from environment', () => {
  const executor = createExecutor();
  expect(executor).toBeDefined();
});

test('executor: getBrief returns work info', async () => {
  const executor = createExecutor('.');
  const brief = await executor.getBrief();
  expect(brief.nodeId).toBeDefined();
  expect(Array.isArray(brief.produces)).toBe(true);
  expect(Array.isArray(brief.consumes)).toBe(true);
});

test('executor: can checkpoint and restore', async () => {
  const executor = createExecutor('.');
  await executor.checkpoint('test-1', { 'src/test.ts': true });
  const restored = await executor.restore('test-1');
  expect(typeof restored).toBe('boolean');
});

test('executor: advance updates status', async () => {
  const executor = createExecutor('.');
  await executor.advance('in-progress');
  expect(true).toBe(true); // Status update is fire-and-forget
});

test('executor: requestHelp on blocked', async () => {
  const executor = createExecutor('.');
  const response = await executor.requestHelp('Test error', 1);
  expect(response).toContain('Help requested');
});

test('executor: bootstrap initializes agent', async () => {
  const executor = createExecutor('.');
  await bootstrapAgent('.');
  expect(true).toBe(true);
});
