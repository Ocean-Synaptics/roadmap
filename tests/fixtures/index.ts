// Shared test fixtures
// Centralized location for all mock data + sample DAGs

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
