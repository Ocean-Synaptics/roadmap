// @module orient-forward
// @entry test

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { findPendingSpecs } from '../src/lib/orient-forward';

test('findPendingSpecs: excludes current DAG', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a spec with current DAG ID
    writeFileSync(
      join(roadmapDir, 'spec-current.json'),
      JSON.stringify({
        dag_id: 'current-dag',
        dag_desc: 'Current DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 0, 'Should exclude current DAG');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: includes unloaded specs', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a spec with different DAG ID
    writeFileSync(
      join(roadmapDir, 'spec-new.json'),
      JSON.stringify({
        dag_id: 'new-dag',
        dag_desc: 'New DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 1, 'Should include unloaded spec');
    assert.equal(result[0].dagId, 'new-dag');
    assert.equal(result[0].desc, 'New DAG spec');
    assert.equal(result[0].path, '.roadmap/spec-new.json');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: excludes historical specs in head-index.json', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create head-index.json with historical DAG ID
    writeFileSync(
      join(roadmapDir, 'head-index.json'),
      JSON.stringify({
        id: 'historical-dag',
      })
    );

    // Create a spec with historical DAG ID
    writeFileSync(
      join(roadmapDir, 'spec-historical.json'),
      JSON.stringify({
        dag_id: 'historical-dag',
        dag_desc: 'Historical DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 0, 'Should exclude historical specs');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: returns empty array when no specs exist', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 0, 'Should return empty array');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: handles missing .roadmap directory', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 0, 'Should return empty array for missing directory');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: handles malformed JSON specs', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a malformed spec file
    writeFileSync(join(roadmapDir, 'spec-bad.json'), '{invalid json}');

    // Create a valid spec file
    writeFileSync(
      join(roadmapDir, 'spec-good.json'),
      JSON.stringify({
        dag_id: 'good-dag',
        dag_desc: 'Good DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 1, 'Should skip malformed specs and include valid ones');
    assert.equal(result[0].dagId, 'good-dag');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: returns PendingSpec with correct shape', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    writeFileSync(
      join(roadmapDir, 'spec-shape.json'),
      JSON.stringify({
        dag_id: 'shape-test-dag',
        dag_desc: 'Test DAG for shape verification',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 1);

    const spec = result[0];
    assert(typeof spec.path === 'string', 'path should be string');
    assert(typeof spec.dagId === 'string', 'dagId should be string');
    assert(
      spec.desc === undefined || typeof spec.desc === 'string',
      'desc should be string or undefined'
    );
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: handles specs without dag_id field', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a spec without dag_id
    writeFileSync(
      join(roadmapDir, 'spec-no-id.json'),
      JSON.stringify({
        dag_desc: 'Spec without dag_id',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 0, 'Should skip specs without dag_id');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('findPendingSpecs: includes multiple unloaded specs', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'orient-forward-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    writeFileSync(
      join(roadmapDir, 'spec-one.json'),
      JSON.stringify({ dag_id: 'dag-one' })
    );
    writeFileSync(
      join(roadmapDir, 'spec-two.json'),
      JSON.stringify({ dag_id: 'dag-two' })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 2, 'Should include both unloaded specs');
    const dagIds = result.map((s) => s.dagId).sort();
    assert.deepEqual(dagIds, ['dag-one', 'dag-two']);
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
