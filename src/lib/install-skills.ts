// @module install-skills
// @exports SkillTemplate, ConstraintExtractor, readPackageVersion, computeSkillHash, embedVersion, installAll
// @types SkillStep, ConstraintResult, InstallAllOpts
// @entry roadmap

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkillStep {
  instruction: string;
}

export interface ConstraintResult {
  sections: Record<string, string>;
  excluded: string[];
}

export interface InstallAllOpts {
  targetDir: string;
  roadmapBin: string;
  constraints?: string; // path to CLAUDE.md for constraint extraction
}

// ── SkillTemplate ─────────────────────────────────────────────────────────────

export class SkillTemplate {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly steps: SkillStep[];
  readonly args?: string;
  readonly contract?: string;

  constructor(id: string, title: string, description: string, steps: SkillStep[], args?: string, contract?: string) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.steps = steps;
    this.args = args;
    this.contract = contract;
  }

  render(context: { roadmapBin: string }): string {
    const lines: string[] = [];
    lines.push(`# /roadmap-${this.id}`);
    lines.push('');
    lines.push(this.description);
    lines.push('');

    if (this.args) {
      lines.push('## Arguments');
      lines.push(this.args);
      lines.push('');
    }

    lines.push('## Steps');
    for (let i = 0; i < this.steps.length; i++) {
      const rendered = this.steps[i].instruction.replace(/\$ROADMAP_BIN/g, context.roadmapBin);
      lines.push(`${i + 1}. ${rendered}`);
    }
    lines.push('');

    if (this.contract) {
      lines.push('## Contract');
      lines.push(this.contract.replace(/\$ROADMAP_BIN/g, context.roadmapBin));
      lines.push('');
    }

    return lines.join('\n');
  }

  write(targetDir: string, context: { roadmapBin: string }): string {
    const content = this.render(context);
    const version = readPackageVersion();
    const hash = computeSkillHash(this.id, version);
    const versioned = embedVersion(content, hash);

    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    const filePath = join(targetDir, `roadmap-${this.id}.md`);
    writeFileSync(filePath, versioned, 'utf-8');
    return filePath;
  }
}

// ── ConstraintExtractor ───────────────────────────────────────────────────────

const BEHAVIORAL_SECTIONS = [
  'identity', 'language', 'structure', 'evidence', 'code', 'meta', 'stance', 'retry',
];

const EXCLUDED_SECTIONS = [
  'roadmap', 'regent', 'roadmap protocol',
];

export class ConstraintExtractor {
  static extract(filePath: string): ConstraintResult {
    const source = readFileSync(resolve(filePath), 'utf-8');
    return ConstraintExtractor.extractFromSource(source);
  }

  static extractFromSource(source: string): ConstraintResult {
    const sections: Record<string, string> = {};
    const excluded: string[] = [];

    // Split on ## headings, preserving heading text
    const parts = source.split(/^##\s+/m);

    for (const part of parts.slice(1)) {
      const newline = part.indexOf('\n');
      if (newline === -1) continue;

      const heading = part.slice(0, newline).trim();
      const body = part.slice(newline + 1).trim();
      const headingLower = heading.toLowerCase();

      // Check if excluded
      if (EXCLUDED_SECTIONS.some(ex => headingLower.includes(ex))) {
        excluded.push(heading);
        continue;
      }

      // Check if behavioral
      if (BEHAVIORAL_SECTIONS.some(beh => headingLower.includes(beh))) {
        sections[heading] = body;
      }
    }

    return { sections, excluded };
  }

  static renderSkill(result: ConstraintResult): string {
    const lines: string[] = [];
    lines.push('# /roadmap-constraints');
    lines.push('');
    lines.push('Behavioral constraints for all agents in this project. Reference this before producing any output.');
    lines.push('');

    for (const [heading, body] of Object.entries(result.sections)) {
      lines.push(`## ${heading}`);
      lines.push(body);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ── Version hashing ───────────────────────────────────────────────────────────

export function readPackageVersion(): string {
  // Walk up from this file to find package.json
  let dir = resolve(import.meta.dirname || __dirname);
  for (let i = 0; i < 5; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      const data = JSON.parse(readFileSync(pkg, 'utf-8'));
      return data.version ?? '0.0.0';
    }
    dir = resolve(dir, '..');
  }
  return '0.0.0';
}

export function computeSkillHash(id: string, version: string): string {
  return createHash('sha256').update(`${id}+${version}`).digest('hex').slice(0, 12);
}

export function embedVersion(markdown: string, hash: string): string {
  const header = `<!-- roadmap-skill-version: ${hash} -->\n`;
  return header + markdown;
}

export function extractVersionHash(markdown: string): string | null {
  const match = markdown.match(/^<!-- roadmap-skill-version: ([a-f0-9]+) -->/);
  return match?.[1] ?? null;
}

// ── Built-in skill templates ──────────────────────────────────────────────────

function builtinTemplates(): SkillTemplate[] {
  return [
    new SkillTemplate(
      'start',
      'Session Start',
      'Start a roadmap-governed session. Run this before any state-mutating work.',
      [
        { instruction: 'Run: `$ROADMAP_BIN orient --note "$intent"`' },
        { instruction: 'Run: `$ROADMAP_BIN chart`' },
        { instruction: 'Return the chart output verbatim — do not summarize, paraphrase, or truncate.' },
      ],
      '- `intent` (required): What you\'re doing and why. This becomes the orient --note.',
      `- Position comes from orient, not memory. This call is canonical.
- If orient returns \`position: "untracked"\`, the breadcrumb still records globally.
- After this skill completes, you know: position[], level, produces[], consumes[], batchRemaining[].`,
    ),

    new SkillTemplate(
      'work',
      'Work Brief',
      'Get the work brief for a node. Run this before implementing.',
      [
        { instruction: 'Run: `$ROADMAP_BIN show $node` → parse JSON' },
        { instruction: 'Present to agent: **Produces** (write targets), **Consumes** (read inputs), **Ambient** (shared context), **Validate** (acceptance tests), **Desc** (what this node does).' },
        { instruction: 'Read each file in `consumes` and present content.' },
        { instruction: 'If `ambient` paths exist, list them (do not read unless agent requests).' },
      ],
      '- `node` (required): Node ID to work on.',
      `- In swarm mode: read ONLY consumes files. Nothing else.
- Produces are your exclusive write targets. No other agent writes these files.
- Validate is your acceptance test. Run these locally before calling /roadmap-done.`,
    ),

    new SkillTemplate(
      'done',
      'Submit Work',
      'Submit completed work for a node. Commits produces and runs validation.',
      [
        { instruction: 'Run: `$ROADMAP_BIN show $node` → get produces[]' },
        { instruction: 'For each path in produces[]: verify file exists. If missing, STOP and report which produces are missing.' },
        { instruction: 'Run: `git add <produces files only>` — never git add . or git add -A' },
        { instruction: 'Run: `git commit -m "$node: $message"`' },
        { instruction: 'Run: `$ROADMAP_BIN complete $node --note "$message"`' },
        { instruction: 'If complete rejects: return the ValidationResult. Do not retry automatically.' },
        { instruction: 'If complete succeeds: return checkpoint ID + unblocked nodes.' },
      ],
      '- `node` (required): Node ID to complete.\n- `message` (required): What was produced (becomes commit message).',
      `- Commit per node, before complete.
- git add only files in produces — exclusive ownership.
- If complete rejects, the commit stands. Fix, commit again, call /roadmap-done again.
- Never --skip-validate unless user explicitly instructs.`,
    ),

    new SkillTemplate(
      'dispatch',
      'Swarm Dispatch',
      'Dispatch agents to work on the current batch. Run before spawning workers.',
      [
        { instruction: 'Run: `$ROADMAP_BIN orient --assign --note "$intent"`' },
        { instruction: 'Run: `$ROADMAP_BIN orient --next` to identify pre-warming batch.' },
        { instruction: 'For each assignment: return { nodeId, owner, produces, consumes }.' },
        { instruction: 'Spawn agents per the --assign output. Pass each agent its assigned node-id.' },
      ],
      '- `intent` (required): Session intent for the dispatch.',
      `- Do not hand-assign nodes — --assign resolves conflicts.
- Spawn the --next batch agents immediately so they pre-warm while current batch runs.
- Never spawn coordination agents. DAG coordinates. One layer max.`,
    ),

    new SkillTemplate(
      'review',
      'Adversarial Review',
      'Run three-pass adversarial review against a proposed DAG before committing.',
      [
        { instruction: 'Pass 1 — Assumption challenge (fool lens): What dependency is assumed but unstated? What breaks if the second batch fails? Where is the single point of failure?' },
        { instruction: 'Pass 2 — Structural review (inquisitor lens): Are acceptance criteria testable and falsifiable? Are dependencies acyclic? Is scope bounded per batch?' },
        { instruction: 'Pass 3 — Deviation check (griffinProxy lens): Does this DAG match the stated intent? Has scope crept? Are there nodes that serve a future need but aren\'t required now?' },
        { instruction: 'Synthesize verdict: proceed (all clean), conditional (risks noted), or reject (structural problem). Each finding must include evidence (node IDs, dependency edges, quoted criteria).' },
      ],
      undefined,
      `- All three passes are mandatory. Do not skip.
- No finding without a referent — cite node IDs, edges, or acceptance criteria.
- reject means do not write the DAG. Reframe with the user.`,
    ),

    new SkillTemplate(
      'gallery',
      'Cross-Roadmap Gallery',
      'Display cross-roadmap parity gallery and ask the user what to act on.',
      [
        { instruction: 'Run: `$ROADMAP_BIN chart --deps` or per-roadmap `$ROADMAP_BIN chart`' },
        { instruction: 'For each discovered roadmap, render a visual block with progress bar, parity status, gap count, and last activity.' },
        { instruction: 'Call AskUserQuestion with options derived from gallery state: roadmaps with gaps get "close N gaps", active batches get "continue LN", converged get "review / start next iteration". Always include "Overview only — no action".' },
      ],
      undefined,
      `- Gallery output is visual-first. Dense tables are for CLI; skills are for humans.
- AskUserQuestion options are derived from state, not hardcoded.
- The user's selection determines the next skill call.`,
    ),

    new SkillTemplate(
      'progress',
      'Progress Checkpoint',
      'Display current roadmap progress and ask the user how to proceed.',
      [
        { instruction: 'Run: `$ROADMAP_BIN orient --check` → get position, level, done, remaining, batchComplete' },
        { instruction: 'Run: `$ROADMAP_BIN chart`' },
        { instruction: 'Compute session context: nodes completed this session (from trail --last), current batch status (N/M complete).' },
        { instruction: 'Render enriched display with progress bar, level, elapsed time, batch status, and session history.' },
        { instruction: 'Call AskUserQuestion with context-appropriate options: "Continue", "Skip to integration", "Pause", "Pivot" (batch in progress); "Continue", "Review", "Pause", "Pivot" (batch complete); "Archive", "Iterate", "Gallery" (DAG complete).' },
      ],
      '- `roadmap` (optional): Specific roadmap to check. Defaults to current repo\'s DAG.',
      `- Call this after every batch completion and at minimum every 30 minutes of active work.
- The user's selection is binding. "Pause" means archive and stop.
- Never call this more than once per node completion.
- Session metrics come from trail, not from memory or estimation.`,
    ),
  ];
}

// ── installAll ────────────────────────────────────────────────────────────────

export function installAll(opts: InstallAllOpts): { installed: string[]; constraintsInstalled: boolean } {
  const templates = builtinTemplates();
  const context = { roadmapBin: opts.roadmapBin };
  const installed: string[] = [];

  for (const tpl of templates) {
    const path = tpl.write(opts.targetDir, context);
    installed.push(path);
  }

  // Constraints extraction
  let constraintsInstalled = false;
  if (opts.constraints) {
    const result = ConstraintExtractor.extract(opts.constraints);
    const content = ConstraintExtractor.renderSkill(result);
    const version = readPackageVersion();
    const hash = computeSkillHash('constraints', version);
    const versioned = embedVersion(content, hash);

    const filePath = join(opts.targetDir, 'roadmap-constraints.md');
    writeFileSync(filePath, versioned, 'utf-8');
    installed.push(filePath);
    constraintsInstalled = true;
  }

  return { installed, constraintsInstalled };
}
