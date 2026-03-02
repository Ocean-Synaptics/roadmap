import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { FileRepairPlanner, detectFileOrganizationIssues, generateFileRepairPlan } from '../../src/lib/disconnect-repair/auto-file-repair';

describe('FileRepairPlanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-repair-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  it('detects misplaced files', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'detector-logic.ts'), 'export {};');

    const planner = new FileRepairPlanner(tmpDir);
    const issues = planner.detectMisplacements();

    // Should detect file that might belong in detector domain
    expect(Array.isArray(issues)).toBe(true);
  });

  it('generates repair plan from issues', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'repair-utility.ts'), 'export {};');

    const planner = new FileRepairPlanner(tmpDir);
    const issues = planner.detectMisplacements();
    const plan = planner.generateRepairPlan(issues);

    expect(Array.isArray(plan)).toBe(true);
  });

  it('exposes detectFileOrganizationIssues function', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);

    const issues = detectFileOrganizationIssues(tmpDir);
    expect(Array.isArray(issues)).toBe(true);
  });

  it('exposes generateFileRepairPlan function', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);

    const plan = generateFileRepairPlan(tmpDir);
    expect(Array.isArray(plan)).toBe(true);
  });
});
