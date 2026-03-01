// @module ts-sandbox
// @exports executeSandboxed, validateImports, IMPORT_ALLOWLIST, SandboxResult, SandboxError
// Allowlist-gated TypeScript executor. Parses imports statically, rejects anything off-list.
// No network, no process spawn, no filesystem beyond explicit paths.

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';

// --- allowlist ---

export const IMPORT_ALLOWLIST = new Set([
  // roadmap core
  'roadmap',
  'roadmap/protocol',
  'roadmap/agent',
  'roadmap/recovery',
  'roadmap/validation',
  'roadmap/versioning',
  'roadmap/explore',
  // node builtins (safe subset)
  'node:path',
  'node:url',
  'node:crypto',
  'node:util',
  'node:assert',
  // lib/* relative imports
]);

const RELATIVE_LIB_PATTERN = /^\.\.?\/|^src\/lib\//;

export interface SandboxResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SandboxError {
  ok: false;
  error: string;
  blockedImports: string[];
}

// --- import validation ---

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function extractImports(code: string): string[] {
  const imports = new Set<string>();
  for (const re of [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) {
      imports.add(m[1]);
    }
  }
  return [...imports];
}

export function validateImports(code: string): { valid: boolean; blocked: string[] } {
  const imports = extractImports(code);
  const blocked: string[] = [];

  for (const spec of imports) {
    if (IMPORT_ALLOWLIST.has(spec)) continue;
    if (RELATIVE_LIB_PATTERN.test(spec)) continue;
    blocked.push(spec);
  }

  return { valid: blocked.length === 0, blocked };
}

// --- dangerous API detection ---

const DANGEROUS_APIS = [
  /\bprocess\s*\.\s*(?:exit|kill|env)/,
  /\bchild_process\b/,
  /\bexecSync\b|\bexec\b|\bspawn\b|\bfork\b/,
  /\bnet\b\s*\.\s*(?:createServer|connect)/,
  /\bhttp\b\s*\.\s*(?:createServer|request|get)/,
  /\bfetch\s*\(/,
  /\bDeno\b/,
  /\bglobalThis\s*\.\s*process/,
];

export function detectDangerousAPIs(code: string): string[] {
  const found: string[] = [];
  for (const re of DANGEROUS_APIS) {
    if (re.test(code)) found.push(re.source);
  }
  return found;
}

// --- sandbox executor ---

export function executeSandboxed(
  code: string,
  opts: { timeout?: number; cwd?: string } = {},
): SandboxResult | SandboxError {
  const validation = validateImports(code);
  if (!validation.valid) {
    return { ok: false, error: 'Blocked imports detected', blockedImports: validation.blocked };
  }

  const dangerous = detectDangerousAPIs(code);
  if (dangerous.length > 0) {
    return { ok: false, error: 'Dangerous APIs detected', blockedImports: dangerous };
  }

  const timeout = opts.timeout ?? 10_000;
  const tmpDir = join(tmpdir(), 'roadmap-sandbox');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const filename = `sandbox-${randomUUID().slice(0, 8)}.ts`;
  const filepath = join(tmpDir, filename);

  try {
    writeFileSync(filepath, code, 'utf-8');
    const stdout = execSync(
      `node --experimental-strip-types ${filepath}`,
      {
        timeout,
        encoding: 'utf-8',
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    return { ok: true, stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      ok: true,
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? '').trim(),
      exitCode: err.status ?? 1,
    };
  } finally {
    try { unlinkSync(filepath); } catch {}
  }
}

// --- typecheck only ---

export function typecheckCode(code: string): SandboxResult | SandboxError {
  const validation = validateImports(code);
  if (!validation.valid) {
    return { ok: false, error: 'Blocked imports detected', blockedImports: validation.blocked };
  }

  const tmpDir = join(tmpdir(), 'roadmap-sandbox');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const filename = `typecheck-${randomUUID().slice(0, 8)}.ts`;
  const filepath = join(tmpDir, filename);

  try {
    writeFileSync(filepath, code, 'utf-8');
    const stdout = execSync(
      `npx tsc --noEmit --strict --allowImportingTsExtensions --moduleResolution Node16 --module Node16 --target ES2022 ${filepath}`,
      { timeout: 15_000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { ok: true, stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      ok: true,
      stdout: (err.stdout ?? '').trim(),
      stderr: (err.stderr ?? '').trim(),
      exitCode: err.status ?? 1,
    };
  } finally {
    try { unlinkSync(filepath); } catch {}
  }
}
