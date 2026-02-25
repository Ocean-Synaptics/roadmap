/**
 * CLI: Generate consumer bootstrap roadmap.ts + boot.ts
 *
 * Usage:
 *   npx roadmap generate-bootstrap \
 *     --project my-project \
 *     --desc "What this builds" \
 *     --init src/index.ts,package.json \
 *     --term dist/index.js,dist/index.d.ts
 *
 * Output: roadmap.ts (to project root), .roadmap/head.json
 */

import { graph, define } from './protocol.ts';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BootstrapConfig {
  projectName: string;
  projectDesc: string;
  initArtifacts: string[];
  termArtifacts: string[];
  outDir?: string;
}

export function generateBootstrapRoadmap(cfg: BootstrapConfig) {
  const outDir = cfg.outDir || process.cwd();

  // Build minimal roadmap: init → build → term
  const roadmapDef = graph({
    id: cfg.projectName,
    desc: cfg.projectDesc,
    init: 'init',
    term: 'deployed',
    nodes: {
      init: {
        id: 'init',
        desc: 'Initial state (what exists)',
        produces: cfg.initArtifacts,
        consumes: [],
        deps: [],
        validate: cfg.initArtifacts.map(a => ({
          type: 'artifact-exists' as const,
          target: a,
        })),
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Compile and generate artifacts',
        produces: cfg.termArtifacts.filter(a => !cfg.initArtifacts.includes(a)),
        consumes: cfg.initArtifacts,
        deps: ['init'],
        validate: cfg.termArtifacts
          .filter(a => !cfg.initArtifacts.includes(a))
          .map(a => ({
            type: 'artifact-exists' as const,
            target: a,
          })),
        idempotent: true,
      },
      deployed: {
        id: 'deployed',
        desc: 'Ready for deployment',
        produces: [],
        consumes: [...cfg.initArtifacts, ...cfg.termArtifacts],
        deps: ['build'],
        validate: [],
        idempotent: false,
      },
    },
  });

  // Validate DAG
  const dag = define(roadmapDef);

  // Generate roadmap.ts source
  const roadmapTs = `import { define, graph } from 'roadmap/protocol';

export default define(graph({
  id: '${cfg.projectName}',
  desc: '${cfg.projectDesc}',
  init: 'init',
  term: 'deployed',
  nodes: {
    init: {
      id: 'init',
      desc: 'Initial state (what exists)',
      produces: [${cfg.initArtifacts.map(a => `'${a}'`).join(', ')}],
      consumes: [],
      deps: [],
      validate: [${cfg.initArtifacts.map(a => `{ type: 'artifact-exists', target: '${a}' }`).join(', ')}],
      idempotent: true,
    },
    build: {
      id: 'build',
      desc: 'Compile and generate artifacts',
      produces: [${dag.nodes.build.produces.map(a => `'${a}'`).join(', ')}],
      consumes: [${cfg.initArtifacts.map(a => `'${a}'`).join(', ')}],
      deps: ['init'],
      validate: [${dag.nodes.build.produces.map(a => `{ type: 'artifact-exists', target: '${a}' }`).join(', ')}],
      idempotent: true,
    },
    deployed: {
      id: 'deployed',
      desc: 'Ready for deployment',
      produces: [],
      consumes: [${[...cfg.initArtifacts, ...cfg.termArtifacts].map(a => `'${a}'`).join(', ')}],
      deps: ['build'],
      validate: [],
      idempotent: false,
    },
  },
}));

export type NodeId = keyof typeof import('./roadmap.ts').default.nodes;
export type Artifact = (typeof import('./roadmap.ts').default.nodes)[NodeId]['produces'][number];
`;

  // Generate boot.ts
  const bootTs = `import { orient, check, verify } from 'roadmap/protocol';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function boot() {
  // Validate DAG
  const checkRes = check(roadmap);
  if (!checkRes.done) {
    throw new Error(\`DAG not connected: \${JSON.stringify(checkRes.orphans)}\`);
  }

  const verifyErrs = verify(roadmap);
  if (verifyErrs.length) {
    throw new Error(\`Contract violations: \${JSON.stringify(verifyErrs)}\`);
  }

  // Find position
  const fsCheck = (a: string) => existsSync(join(process.cwd(), a));
  return orient(roadmap, fsCheck);
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  boot()
    .then(pos => {
      console.log(\`Position: \${pos.position}\`);
      console.log(\`Produces: \${pos.produces.join(', ')}\`);
      console.log(\`Remaining: \${pos.remaining.length}\`);
    })
    .catch(e => {
      console.error('Boot failed:', e.message);
      process.exit(1);
    });
}
`;

  // Write files
  writeFileSync(join(outDir, 'roadmap.ts'), roadmapTs);
  writeFileSync(join(outDir, 'boot.ts'), bootTs);

  // Write .roadmap/head.json
  mkdirSync(join(outDir, '.roadmap'), { recursive: true });
  writeFileSync(
    join(outDir, '.roadmap', 'head.json'),
    JSON.stringify(dag, null, 2)
  );

  return { dag, roadmapTs, bootTs };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const config: Partial<BootstrapConfig> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') config.projectName = args[++i];
    if (args[i] === '--desc') config.projectDesc = args[++i];
    if (args[i] === '--init') config.initArtifacts = args[++i].split(',');
    if (args[i] === '--term') config.termArtifacts = args[++i].split(',');
    if (args[i] === '--out') config.outDir = args[++i];
  }

  if (!config.projectName || !config.projectDesc || !config.initArtifacts || !config.termArtifacts) {
    console.error('Usage: generate-bootstrap.ts --project NAME --desc DESC --init ARTS --term ARTS');
    process.exit(1);
  }

  try {
    generateBootstrapRoadmap(config as BootstrapConfig);
    console.log(`✓ Bootstrap generated: roadmap.ts, boot.ts, .roadmap/head.json`);
  } catch (e) {
    console.error('Generation failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

export default generateBootstrapRoadmap;
