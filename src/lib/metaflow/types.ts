// @module metaflow
// @exports RunId, StepId, RunMeta, InteractionReceipt, TutorialBlock, QuestionBlock, AnswerRecord, SessionBinding, SessionsStore, ToolHotspot, FrictionCategory, FrictionFinding, MiningResult, GanttEntry, GanttChart, OptimizationNode
// @entry roadmap/metaflow

// Branded types
export type RunId = string & { readonly __brand: 'RunId' };
export type StepId = string & { readonly __brand: 'StepId' };

export interface RunMeta {
  schema_version: 1;
  runId: RunId;
  repoRoot: string;
  headSha: string;
  createdAt: string; // ISO
  strictReceipts: boolean;
  questions?: QuestionBlock[];
  answers?: AnswerRecord[];
}

export interface InteractionReceipt {
  schema_version: 1;
  runId: RunId;
  stepId: StepId;
  cmd: string;
  intent: string;
  audience: string;
  render: {
    plainPath: string;
    ansiPath: string;
    width: number;
    emoji: boolean;
    color: boolean;
  };
  tutorial?: TutorialBlock;
  evidence: {
    headSha: string;
    toolCalls: number;
    latencyMs: number;
  };
}

export interface TutorialBlock {
  mode: 'guided' | 'inform';
  askedQuestions?: QuestionBlock[];
  nextStepHints: string[];
}

export interface QuestionBlock {
  id: string;
  text: string;
  type: 'choice' | 'text';
  choices?: string[];
}

export interface AnswerRecord {
  questionId: string;
  value: string;
  recordedAt: string; // ISO
}

export interface SessionBinding {
  workerId: string;
  agentSessionId: string;
  headSha: string;
  gitIndexFile: string;
  hookProfile: string;
  lastSeenAt: string; // ISO
  capabilities: string[];
  status: 'idle' | 'running' | 'blocked';
}

export interface SessionsStore {
  schema_version: 1;
  teamId: string;
  sessions: SessionBinding[];
  reuseField?: { teamReuseMissed: boolean; missedAt?: string };
}

export interface ToolHotspot {
  tool: string;
  count: number;
  agentIds: string[];
}

export type FrictionCategory = 'orient-churn' | 'validate-loop' | 'tool-inflation' | 'ask-churn' | 'enforcement-retry';

export interface FrictionFinding {
  category: FrictionCategory;
  subcategory: string;
  agent: string;
  detail: string;
  time?: number;
}

export interface MiningResult {
  schema_version: 1;
  runId: RunId;
  computedAt: string; // ISO
  latencyP50Ms: number;
  latencyP95Ms: number;
  toolCallTotal: number;
  hotspots: ToolHotspot[];
  friction: FrictionFinding[];
  teamReuseMissed: boolean;
}

export interface GanttEntry {
  nodeId: string;
  batchLevel: number;
  deps: string[];
  startOffset?: number;
  endOffset?: number;
}

export interface GanttChart {
  schema_version: 1;
  runId: RunId;
  entries: GanttEntry[];
  generatedAt: string; // ISO
}

export interface OptimizationNode {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  rationale: string;
}
