import { describe, it, expect } from 'vitest';
import * as hooks from '../src/index.hooks.ts';
import * as git from '../src/index.git.ts';
import * as dev from '../src/index.developer.ts';
import * as full from '../src/index.full.ts';

describe('consumer categories entry points', () => {
  it('hooks entry point exports git operations', () => {
    expect(hooks.repoInfo).toBeDefined();
    expect(hooks.stageAndCommit).toBeDefined();
    expect(hooks.isClean).toBeDefined();
  });

  it('git entry point exports git library', () => {
    expect(git.repoInfo).toBeDefined();
    expect(git.archivedFiles).toBeDefined();
  });

  it('developer entry point exports protocol + predicates', () => {
    expect(dev.define).toBeDefined();
    expect(dev.orient).toBeDefined();
    expect(dev.fileExists).toBeDefined();
    expect(dev.compound).toBeDefined();
  });

  it('full entry point re-exports from index', () => {
    expect(full.define).toBeDefined();
    expect(full.repoInfo).toBeDefined();
    expect(full.crossOrient).toBeDefined();
  });
});
