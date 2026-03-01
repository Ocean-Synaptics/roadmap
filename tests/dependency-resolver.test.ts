import { test, expect } from 'vitest';
import { discoverDependencies } from '../src/lib/utils/dependency-resolver.ts';

test('resolver: discovers dependencies from metadata', async () => {
  const deps = await discoverDependencies('.');
  expect(Array.isArray(deps)).toBe(true);
});
