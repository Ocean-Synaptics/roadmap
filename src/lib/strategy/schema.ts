// @module strategy
// @exports StrategyConfig, StrategyReceipt, ActiveStrategy
// @types StrategyConfig, StrategyReceipt, ActiveStrategy
// @entry roadmap

export interface StrategyConfig {
  id: string;
  name: string;
  desc: string;
  rounds: number;
  gateMode: 'per-batch' | 'per-phase' | 'terminal';
  allowedBypasses: never[];
  estimatedRisk: 'low' | 'medium' | 'high';
}

export interface StrategyReceipt {
  schema_version: 1;
  strategyId: string;
  runId: string;
  headSha: string;
  treeSha: string;
  selectionMethod: 'auto' | 'ask' | 'manual';
  candidateSetHash: string;
  config: StrategyConfig;
  evidence: Record<string, unknown>;
  selectedAt: string;
}

export interface ActiveStrategy {
  schema_version: 1;
  strategyId: string;
  runId: string;
  latchedAt: string;
  boundAt: string;
  receiptPath: string;
}
