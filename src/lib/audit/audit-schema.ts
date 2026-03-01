// @module audit
// @exports SurfaceSchema, PlanSchema, ResultSchema, FileRole, FileEntry, MoveOp, DeleteOp, WrapOp
// @exports validateSurface, validatePlan, validateResult
// @entry roadmap/audit

// --- File roles and inventory ---

export type FileRole = 'cli-entry' | 'command' | 'core' | 'lib' | 'test' | 'script' | 'doc' | 'config' | 'generated';

export interface FileEntry {
  path: string;
  role: FileRole;
  hash: string;           // content hash (sha256 hex prefix or full)
  sizeBytes: number;
  exports?: string[];      // named exports (optional, for TS files)
}

export interface SurfaceSchema {
  version: 1;
  timestamp: string;       // ISO 8601
  root: string;            // repo root absolute path
  files: FileEntry[];
  summary: {
    total: number;
    byRole: Record<FileRole, number>;
  };
}

// --- Plan operations ---

export interface MoveOp {
  type: 'move';
  from: string;
  to: string;
  hash: string;
}

export interface DeleteOp {
  type: 'delete';
  path: string;
  hash: string;
}

export interface WrapOp {
  type: 'wrap';
  original: string;       // original module path
  wrapper: string;        // new CLI wrapper path
  exports: string[];      // which exports to re-export
}

export type PlanOp = MoveOp | DeleteOp | WrapOp;

export interface PlanSchema {
  version: 1;
  timestamp: string;
  ops: PlanOp[];
  order: string[];         // execution order (paths, deterministic)
  sourceHashes: Record<string, string>;  // path → hash before apply
}

// --- Result receipt ---

export interface ResultSchema {
  version: 1;
  timestamp: string;
  applied: PlanOp[];
  skipped: PlanOp[];
  hashes: {
    before: Record<string, string>;
    after: Record<string, string>;
  };
  receipt: {
    ok: boolean;
    errors: string[];
    duration_ms: number;
  };
}

// --- Runtime validators ---

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

const VALID_ROLES: Set<string> = new Set<string>([
  'cli-entry', 'command', 'core', 'lib', 'test', 'script', 'doc', 'config', 'generated',
]);

function validateFileEntry(e: unknown, i: number): string[] {
  const errors: string[] = [];
  if (!isObject(e)) return [`files[${i}]: not an object`];
  if (typeof e.path !== 'string') errors.push(`files[${i}].path: must be string`);
  if (typeof e.role !== 'string' || !VALID_ROLES.has(e.role)) errors.push(`files[${i}].role: invalid`);
  if (typeof e.hash !== 'string') errors.push(`files[${i}].hash: must be string`);
  if (typeof e.sizeBytes !== 'number') errors.push(`files[${i}].sizeBytes: must be number`);
  return errors;
}

function validatePlanOp(op: unknown, i: number): string[] {
  const errors: string[] = [];
  if (!isObject(op)) return [`ops[${i}]: not an object`];
  const type = op.type;
  if (type === 'move') {
    if (typeof op.from !== 'string') errors.push(`ops[${i}].from: must be string`);
    if (typeof op.to !== 'string') errors.push(`ops[${i}].to: must be string`);
    if (typeof op.hash !== 'string') errors.push(`ops[${i}].hash: must be string`);
  } else if (type === 'delete') {
    if (typeof op.path !== 'string') errors.push(`ops[${i}].path: must be string`);
    if (typeof op.hash !== 'string') errors.push(`ops[${i}].hash: must be string`);
  } else if (type === 'wrap') {
    if (typeof op.original !== 'string') errors.push(`ops[${i}].original: must be string`);
    if (typeof op.wrapper !== 'string') errors.push(`ops[${i}].wrapper: must be string`);
    if (!isStringArray(op.exports)) errors.push(`ops[${i}].exports: must be string[]`);
  } else {
    errors.push(`ops[${i}].type: must be 'move' | 'delete' | 'wrap'`);
  }
  return errors;
}

export function validateSurface(v: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(v)) return { ok: false, errors: ['not an object'] };
  if (v.version !== 1) errors.push('version: must be 1');
  if (typeof v.timestamp !== 'string') errors.push('timestamp: must be string');
  if (typeof v.root !== 'string') errors.push('root: must be string');
  if (!Array.isArray(v.files)) {
    errors.push('files: must be array');
  } else {
    (v.files as unknown[]).forEach((e, i) => errors.push(...validateFileEntry(e, i)));
  }
  if (!isObject(v.summary)) {
    errors.push('summary: must be object');
  } else {
    if (typeof v.summary.total !== 'number') errors.push('summary.total: must be number');
    if (!isObject(v.summary.byRole)) errors.push('summary.byRole: must be object');
  }
  return { ok: errors.length === 0, errors };
}

export function validatePlan(v: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(v)) return { ok: false, errors: ['not an object'] };
  if (v.version !== 1) errors.push('version: must be 1');
  if (typeof v.timestamp !== 'string') errors.push('timestamp: must be string');
  if (!Array.isArray(v.ops)) {
    errors.push('ops: must be array');
  } else {
    (v.ops as unknown[]).forEach((op, i) => errors.push(...validatePlanOp(op, i)));
  }
  if (!isStringArray(v.order)) errors.push('order: must be string[]');
  if (!isObject(v.sourceHashes)) errors.push('sourceHashes: must be object');
  return { ok: errors.length === 0, errors };
}

export function validateResult(v: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(v)) return { ok: false, errors: ['not an object'] };
  if (v.version !== 1) errors.push('version: must be 1');
  if (typeof v.timestamp !== 'string') errors.push('timestamp: must be string');
  if (!Array.isArray(v.applied)) errors.push('applied: must be array');
  if (!Array.isArray(v.skipped)) errors.push('skipped: must be array');
  if (!isObject(v.hashes)) {
    errors.push('hashes: must be object');
  } else {
    if (!isObject(v.hashes.before)) errors.push('hashes.before: must be object');
    if (!isObject(v.hashes.after)) errors.push('hashes.after: must be object');
  }
  if (!isObject(v.receipt)) {
    errors.push('receipt: must be object');
  } else {
    if (typeof v.receipt.ok !== 'boolean') errors.push('receipt.ok: must be boolean');
    if (!isStringArray(v.receipt.errors)) errors.push('receipt.errors: must be string[]');
    if (typeof v.receipt.duration_ms !== 'number') errors.push('receipt.duration_ms: must be number');
  }
  return { ok: errors.length === 0, errors };
}
