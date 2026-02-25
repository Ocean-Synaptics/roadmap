/**
 * Roadmap Executor Agent — autonomous implementation
 *
 * This is the execution engine for regent agents working on roadmaps.
 * Agents don't need to understand the full DAG; they follow the brief.
 *
 * Usage:
 *   const executor = new RoadmapExecutor(repoRoot, dagPath);
 *   const brief = await executor.getBrief();
 *   // ... work ...
 *   await executor.checkpoint({progress: 0.5, discovered: [...], blockers: [...]});
 *   // ... more work ...
 *   await executor.advance({summary: "...", keyDecisions: [...], ...});
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph, Brief, FinalHandoff, InterimHandoff } from '../../src/index.ts';
import {
  getBrief as getSealedBrief,
  checkpoint as writeCheckpoint,
  advance as movePosition,
  verifyBootstrapSignature,
} from '../../src/index.ts';

export class RoadmapExecutor {
  private repoRoot: string;
  private dag: Graph;

  constructor(repoRoot: string, dagPath?: string) {
    this.repoRoot = repoRoot;

    // Load DAG from .roadmap/head.json or specified path
    const headPath = dagPath || join(repoRoot, '.roadmap', 'head.json');
    try {
      const content = readFileSync(headPath, 'utf-8');
      this.dag = JSON.parse(content);
    } catch (e) {
      throw new Error(
        `Cannot load roadmap: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Get sealed brief for current position
   * This is the first call an agent makes
   */
  async getBrief(): Promise<Brief> {
    // Verify bootstrap integrity
    const verified = await verifyBootstrapSignature(this.repoRoot, this.dag);
    if (!verified) {
      throw new Error('DAG integrity check failed: bootstrap signature mismatch');
    }

    return getSealedBrief(this.dag, this.currentPosition(), this.repoRoot);
  }

  /**
   * Checkpoint work progress
   * Write interim handoff to work journal
   * Can be called multiple times during a node
   */
  async checkpoint(interim: Omit<InterimHandoff, 'timestamp'>): Promise<void> {
    const checkpoint: InterimHandoff = {
      ...interim,
      timestamp: new Date().toISOString(),
    };

    await writeCheckpoint(this.repoRoot, this.currentPosition(), checkpoint);
  }

  /**
   * Advance to next node
   * Validates handoff is complete, writes final artifact, moves position
   * Can only be called once per node (moving to next position)
   */
  async advance(handoff: Omit<FinalHandoff, 'timestamp'>): Promise<void> {
    const finalHandoff: FinalHandoff = {
      ...handoff,
      timestamp: new Date().toISOString(),
    };

    await movePosition(this.repoRoot, this.currentPosition(), this.dag, finalHandoff);
  }

  /**
   * Get current position in roadmap
   * Reads from .roadmap/.position
   */
  private currentPosition(): string {
    try {
      const { readFileSync } = require('node:fs');
      const posFile = join(this.repoRoot, '.roadmap', '.position');
      const pos = readFileSync(posFile, 'utf-8').trim();
      return pos || 'init';
    } catch {
      return 'init'; // Default to init if no position file
    }
  }

  /**
   * Utility: Get node spec for current position
   * Agents can use this to understand what they're building
   */
  async getNodeSpec() {
    const brief = await this.getBrief();
    const nodeId = brief.position;
    const node = this.dag.nodes[nodeId as keyof typeof this.dag.nodes];

    return {
      id: nodeId,
      description: node?.desc || '(unknown)',
      produces: node?.produces || [],
      consumes: node?.consumes || [],
      pattern: brief.pattern,
      handoff: brief.handoff,
    };
  }

  /**
   * Utility: Log the work journal for current position
   * Helpful for understanding what previous agents discovered
   */
  async logWorkJournal(): Promise<void> {
    const brief = await this.getBrief();

    if (!brief.handoffJournal || brief.handoffJournal.length === 0) {
      console.log('(no prior work on this node)');
      return;
    }

    console.log('Work journal:');
    for (const entry of brief.handoffJournal) {
      const progress = Math.round((entry.progress || 0) * 100);
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '?';

      console.log(`  [${time}] ${progress}% — ${entry.discovered?.join(', ') || 'no updates'}`);

      if (entry.blockers && entry.blockers.length > 0) {
        console.log(`    ⚠️  ${entry.blockers.join(', ')}`);
      }

      if ('summary' in entry && entry.summary) {
        console.log(`    ✓ ${entry.summary}`);
      }
    }
  }
}

/**
 * Simple executor pattern for quick scripting
 */
export async function executeRoadmapNode(repoRoot: string): Promise<void> {
  const executor = new RoadmapExecutor(repoRoot);

  console.log('=== Roadmap Executor ===\n');

  // Step 1: Get briefing
  const brief = executor.getBrief();
  console.log(`Position: ${brief.position}`);
  console.log(`Task: ${brief.description}\n`);

  if (brief.handoff) {
    console.log('Previous work:');
    console.log(`  Summary: ${brief.handoff.summary}`);
    console.log(`  Key decisions: ${brief.handoff.keyDecisions.join(', ')}\n`);
  }

  // Step 2: Show what to build
  console.log(`What to build:`);
  brief.produces.forEach((f) => console.log(`  - ${f}`));
  console.log(`\nWhat's available:`);
  brief.consumes.forEach((f) => console.log(`  - ${f}`));

  console.log(`\nPattern: ${brief.pattern}\n`);

  // Step 3: Placeholder for actual work
  console.log('(Agent would do work here, checkpoint periodically, then advance)\n');
}

export default RoadmapExecutor;
