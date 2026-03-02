// Shared test fixtures
// Centralized location for all mock data + sample DAGs

// Re-export test infrastructure
export { TestRepo, type TestRepoConfig, type GitCommit } from './test-repo-factory.ts';
export {
  createAlignedState,
  createStaleState,
  createMultiCycleState,
  createMalformedState,
  getFixtureName,
} from './state-builders.ts';

// Sample data
export const sampleDAG = {
  id: 'test-dag',
  init: 'init',
  term: 'term',
  nodes: {
    init: { id: 'init', produces: [], consumes: [], deps: [], validate: [] },
    term: { id: 'term', produces: [], consumes: [], deps: ['init'], validate: [] }
  }
};

export const sampleValidatorRule = {
  type: 'artifact-exists',
  path: '.audit/sample.json'
};

export const sampleReceipt = {
  schema_version: 1,
  nodeId: 'test-node',
  status: 'complete'
};
