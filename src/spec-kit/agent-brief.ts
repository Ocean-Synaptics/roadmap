// @module spec-kit
// @exports generateAgentBrief
// @types AgentBriefOptions, AgentBrief
// @entry roadmap/spec-kit

import { existsSync, readdirSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';
import type { AgentBriefOptions, AgentBrief } from './types-brief.ts';

/**
 * Generate a markdown brief with YAML frontmatter for a spec-kit agent.
 * Provides roadmap position, spec workspace layout, and next-step commands.
 */
export function generateAgentBrief(options: AgentBriefOptions): AgentBrief {
  const { dagId, intent, orientation, specKitWorkspace } = options;
  const produces = options.nodeProduces ?? orientation.produces;
  const consumes = options.nodeConsumes ?? orientation.consumes;

  const specFiles = discoverSpecFiles(specKitWorkspace);

  const frontmatter: Record<string, unknown> = {
    dagId,
    level: orientation.level,
    position: orientation.position,
    batchComplete: orientation.batchComplete,
    done: orientation.done.length,
    remaining: orientation.remaining.length,
    produces: [...produces],
    consumes: [...consumes],
    specKitWorkspace,
  };

  const markdown = renderBrief(frontmatter, intent, specFiles, specKitWorkspace);

  return { frontmatter, markdown };
}

/** Discover spec files in the workspace directory. */
function discoverSpecFiles(workspace: string): string[] {
  const absPath = resolve(workspace);
  if (!existsSync(absPath)) return [];

  try {
    return readdirSync(absPath, { recursive: true })
      .map(f => typeof f === 'string' ? f : f.toString())
      .filter(f => /\.(md|json|yaml|yml|ts)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/** Render the full markdown brief with YAML frontmatter. */
function renderBrief(
  fm: Record<string, unknown>,
  intent: string,
  specFiles: string[],
  workspace: string,
): string {
  const yamlLines = Object.entries(fm).map(([k, v]) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return `${k}: []`;
      return `${k}:\n${v.map(item => `  - ${item}`).join('\n')}`;
    }
    return `${k}: ${JSON.stringify(v)}`;
  });

  const position = fm['position'] as string[];
  const produces = fm['produces'] as string[];
  const consumes = fm['consumes'] as string[];
  const remaining = fm['remaining'] as number;

  const sections: string[] = [
    `---\n${yamlLines.join('\n')}\n---`,
    `# Agent Brief: ${fm['dagId']}`,
    `## Intent\n\n${intent}`,
    `## Position\n\n- **Batch (L${fm['level']}):** ${position.join(', ')}\n- **Batch complete:** ${fm['batchComplete']}\n- **Remaining nodes:** ${remaining}`,
  ];

  // Produces / consumes
  if (produces.length > 0) {
    sections.push(`## Produces\n\n${produces.map(p => `- \`${p}\``).join('\n')}`);
  }
  if (consumes.length > 0) {
    sections.push(`## Consumes\n\n${consumes.map(c => `- \`${c}\``).join('\n')}`);
  }

  // Spec files
  if (specFiles.length > 0) {
    const fileList = specFiles.map(f => `- \`${workspace}/${f}\``).join('\n');
    sections.push(`## Spec Files\n\n${fileList}`);
  } else {
    sections.push(`## Spec Files\n\nNo spec files found in \`${workspace}\`. Run the spec-kit pipeline to generate them.`);
  }

  // Workflow commands
  sections.push(
    `## Next Steps\n\n` +
    `1. Read spec files in \`${workspace}\`\n` +
    `2. Run \`/speckit.specify\` — generate specification from pre-spec\n` +
    `3. Run \`/speckit.plan\` — produce implementation plan\n` +
    `4. Run \`/speckit.tasks\` — emit task DAG nodes\n` +
    `5. Run \`roadmap import --from speckit <tasks.json> --id ${fm['dagId']}\` — import into roadmap`,
  );

  // Error handling tips
  sections.push(
    `## Troubleshooting\n\n` +
    `- **Missing spec files:** Ensure \`${workspace}\` exists and contains \`pre-spec.md\`\n` +
    `- **Validation failures:** Run \`roadmap validate --note "checking"\` to see which rules fail\n` +
    `- **Import errors:** Validate tasks JSON with \`validateSpecKitTasks()\` before importing\n` +
    `- **Position stale:** Re-run \`roadmap orient --note "re-check"\` to refresh batch position`,
  );

  return sections.join('\n\n') + '\n';
}
