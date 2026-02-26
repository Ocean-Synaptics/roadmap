/**
 * Consumer bootstrap example: using generateBootstrap to create a new project roadmap.
 * This demonstrates how a consumer would use the bootstrap generator to get started.
 */

import { generateBootstrap, validateBootstrapOptions, BootstrapOptions } from '../src/generate-bootstrap';
import fs from 'fs';
import path from 'path';

/**
 * Example: Bootstrap a new monorepo project.
 */
function bootstrapNewProject() {
  const options: BootstrapOptions = {
    projectName: 'my-workspace',
    template: 'monorepo',
    targetDir: './new-project',
    force: false,
  };

  console.log(`Bootstrapping ${options.projectName} with template ${options.template}...`);

  // Validate
  const errors = validateBootstrapOptions(options);
  if (errors.length > 0) {
    console.error('Bootstrap validation failed:');
    errors.forEach((e) => console.error(`  - ${e}`));
    return;
  }

  // Generate
  const { roadmapTs, headJson, bootstrapMd } = generateBootstrap(options);

  // Write files (in real usage, this would be done with permission checks)
  console.log('Generated files:');
  console.log('');
  console.log('=== roadmap.ts (skeleton) ===');
  console.log(roadmapTs);
  console.log('');
  console.log('=== .roadmap/head.json ===');
  console.log(headJson);
  console.log('');
  console.log('=== BOOTSTRAP.md ===');
  console.log(bootstrapMd);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Copy the above files to your project directory');
  console.log('  2. Edit roadmap.ts to add your project phases');
  console.log('  3. Run: npx ts-node roadmap.ts');
  console.log('  4. Implement phases and run again to advance');
}

/**
 * Example: Bootstrap a simple single-project roadmap.
 */
function bootstrapSimpleProject() {
  const options: BootstrapOptions = {
    projectName: 'my-app',
    template: 'init',
    targetDir: './my-app',
    force: false,
  };

  const { roadmapTs } = generateBootstrap(options);

  console.log('Simple project roadmap.ts:');
  console.log(roadmapTs);
}

/**
 * Example: Bootstrap a multi-repo workspace.
 */
function bootstrapMultiRepoWorkspace() {
  const options: BootstrapOptions = {
    projectName: 'workspace',
    template: 'multi-repo',
    targetDir: './workspace',
    force: false,
  };

  const { headJson } = generateBootstrap(options);

  console.log('Multi-repo workspace DAG:');
  console.log(headJson);
}

// Run examples
console.log('=== Bootstrap Generator Examples ===\n');

console.log('Example 1: Monorepo Bootstrap');
console.log('-'.repeat(40));
bootstrapNewProject();

console.log('\n\nExample 2: Simple Project Bootstrap');
console.log('-'.repeat(40));
bootstrapSimpleProject();

console.log('\n\nExample 3: Multi-Repo Workspace Bootstrap');
console.log('-'.repeat(40));
bootstrapMultiRepoWorkspace();

export { bootstrapNewProject, bootstrapSimpleProject, bootstrapMultiRepoWorkspace };
