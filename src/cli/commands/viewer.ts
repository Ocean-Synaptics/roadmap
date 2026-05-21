// @module cli/commands/viewer
// @description `roadmap viewer` first-class subcommand. Spawns viewer dev/preview
//              server pointed at the host repo's .roadmap/. Wired into bin/roadmap.ts
//              command registry alongside make/orient/advance/init.
// @exports run
//
// Flags:
//   --preview            run vite preview against viewer/dist (instead of dev mode)
//   --port <n>           override default port
//   --host-repo <path>   override host repo (defaults to $PWD)
//
// HOST_REPO is exported into the spawned child so realtimeBridge + readers
// resolve the host's .roadmap/ rather than the engine repo's own.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { emit } from '../../lib/cli-envelope.ts';
import type { OutputOpts } from '../../lib/cli-envelope.ts';

// Resolve the engine install root from this module's own location, NOT cwd.
// Source layout: <engine>/src/cli/commands/viewer.ts → ../../../ = <engine>.
// Bundled layout: <engine>/dist/roadmap.js → ../ = <engine>.
// Walk upward looking for a sibling `viewer/package.json`.
function resolveEngineRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'viewer', 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume source layout (3 up from src/cli/commands/).
  return resolve(here, '..', '..', '..');
}

interface ViewerFlags {
  help: boolean;
  preview: boolean;
  port?: number;
  hostRepo: string;
  scanRoot?: string;
  hostOnly: boolean;
}

function parseFlags(args: string[], repoRoot: string): ViewerFlags {
  const flags: ViewerFlags = {
    help: false, preview: false, hostRepo: process.cwd(), hostOnly: false,
  };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--preview') flags.preview = true;
    else if (a === '--port') flags.port = Number(args[++i]);
    else if (a === '--host-repo') flags.hostRepo = args[++i];
    else if (a === '--scan-root') flags.scanRoot = args[++i];
    else if (a === '--host-only') flags.hostOnly = true;
  }
  // host repo defaults to caller's $PWD (already from process.cwd above);
  // viewer source itself lives at <roadmap-engine repo>/viewer/.
  void repoRoot;
  return flags;
}

function printHelp(opts: OutputOpts): void {
  emit({ ok: true, cmd: 'viewer', data: {
    command: 'viewer',
    description: 'Start the roadmap viewer dev server pointed at the current host repo .roadmap/.',
    usage: 'roadmap viewer [--preview] [--port <n>] [--host-repo <path>] [--scan-root <path>] [--host-only]',
    flags: {
      '--preview': 'Serve pre-built dist/ via vite preview instead of dev mode',
      '--port <n>': 'Override default port',
      '--host-repo <path>': 'Override host repo (defaults to $PWD)',
      '--scan-root <path>': 'Override scan root for roadmap discovery (default: $ROADMAP_DEV_ROOT or ~/src)',
      '--host-only': 'Disable machine-wide discovery; show only the host repo (and its fleet.json, if any)',
    },
    examples: [
      'roadmap viewer                              # default: discover all roadmaps under ~/src',
      'roadmap viewer --scan-root ~/projects',
      'roadmap viewer --host-only                  # legacy single-repo / fleet.json mode',
      'roadmap viewer --preview --host-repo /path/to/your/repo',
    ],
  } }, opts);
}

export async function run(args: string[], repoRoot: string, _note: string, opts: OutputOpts): Promise<void> {
  const flags = parseFlags(args, repoRoot);
  if (flags.help) return printHelp(opts);

  const engineRoot = resolveEngineRoot();
  const viewerDir = join(engineRoot, 'viewer');
  const viewerPkg = join(viewerDir, 'package.json');
  if (!existsSync(viewerPkg)) {
    emit({ ok: false, cmd: 'viewer', error: {
      code: 'VIEWER_MISSING',
      message: `viewer/package.json not found at ${viewerPkg}`,
      fix: [
        'Reinstall the engine: viewer/ should ship with the package',
        'If running from a checkout, run: pnpm install at the repo root',
      ],
      hint: 'Engine ships viewer/ as a sibling Vite app; missing means broken install.',
    } }, opts);
    process.exit(1);
  }

  const mode = flags.preview ? 'preview' : 'dev';
  // Set both ROADMAP_HOST_REPO (canonical · what vite.config + readers consume)
  // and HOST_REPO (legacy alias) so child env stays compatible either way.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ROADMAP_HOST_REPO: flags.hostRepo,
    HOST_REPO: flags.hostRepo,
  };
  if (flags.port) env.PORT = String(flags.port);

  // Default behavior: discover every roadmap on the machine under ~/src (or
  // $ROADMAP_DEV_ROOT). --host-only opts out and restores legacy single-repo
  // / fleet.json semantics. --scan-root overrides the default path.
  if (!flags.hostOnly) {
    const home = process.env.HOME ?? '';
    const scanRoot = flags.scanRoot
      ?? process.env.ROADMAP_FS_SCAN_ROOT
      ?? process.env.ROADMAP_DEV_ROOT
      ?? (home ? join(home, 'src') : process.cwd());
    env.ROADMAP_FS_SCAN_ROOT = scanRoot;
    env.ROADMAP_VIEWER_SCAN_ALL = '1';
  }

  const child = spawn('pnpm', ['--dir', viewerDir, mode], { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
}
