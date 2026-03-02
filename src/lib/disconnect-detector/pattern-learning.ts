// Pattern learning — learn common disconnect patterns for prevention

import fs from 'fs';
import path from 'path';

export interface DisconnectPattern {
  name: string;
  description: string;
  indicators: string[];
  preventionSteps: string[];
  likelihood: 'common' | 'rare' | 'occasional';
}

export class PatternLearner {
  private root: string;
  private patterns: DisconnectPattern[] = [
    {
      name: 'DAG Switch Mid-Flight',
      description: 'Switching to new DAG while workers still executing on old DAG',
      indicators: [
        'completed.json references old DAG',
        'head.json shows new DAG',
        'active worker checkpoints exist',
      ],
      preventionSteps: [
        'Ensure all workers complete before DAG switch',
        'Run `roadmap advance` before switching',
        'Wait for batch completion gates',
      ],
      likelihood: 'common',
    },
    {
      name: 'Incomplete Refactoring',
      description: 'Files moved or imports updated without updating completion records',
      indicators: [
        'produces artifacts missing',
        'file paths in completed.json are stale',
        'import errors detected',
      ],
      preventionSteps: [
        'Commit produces before marking node complete',
        'Run `roadmap complete` after all files materialized',
        'Verify imports resolve',
      ],
      likelihood: 'common',
    },
    {
      name: 'Parallel Worker Race',
      description: 'Multiple workers modifying same file without coordination',
      indicators: [
        'git merge conflicts',
        'duplicate repairs applied',
        'completion records diverged',
      ],
      preventionSteps: [
        'Use `SKIP_BATCH_COMMIT` with worker ID',
        'Assign non-overlapping file sets per worker',
        'Use git pull --rebase before commit',
      ],
      likelihood: 'occasional',
    },
  ];

  constructor(root: string) {
    this.root = root;
  }

  async learnPatterns(): Promise<DisconnectPattern[]> {
    // Analyze history to detect which patterns are occurring
    const historyPath = path.join(this.root, '.roadmap/repairs/history.jsonl');

    if (fs.existsSync(historyPath)) {
      const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter(l => l);
      // Analysis logic would go here
      // For now, return static patterns
    }

    return this.patterns;
  }

  suggestPreventiveMeasures(): string[] {
    const suggestions: string[] = [];

    // Add recommendations based on patterns
    suggestions.push('Enable batch completion gates');
    suggestions.push('Use worker-scoped batch commits');
    suggestions.push('Monitor repair history for pattern recurrence');

    return suggestions;
  }
}

export async function learnDisconnectPatterns(root: string): Promise<DisconnectPattern[]> {
  const learner = new PatternLearner(root);
  return learner.learnPatterns();
}
