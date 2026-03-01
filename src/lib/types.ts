// Single source of truth for all library types
// Imports from this file; implementations in respective modules

export interface NodeSpec<TAll = string, TSelf extends TAll = TAll> {
  id: TSelf;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: TAll[];
  validate: ValidationRule[];
  mode?: 'execute' | 'plan';
  expandedFrom?: string;
}

export interface Graph<T extends string = string> {
  id: string;
  desc: string;
  init: T;
  term: T;
  nodes: Record<T, NodeSpec<T, T>>;
}

export type ValidationRule = 
  | { type: 'artifact-exists'; path: string }
  | { type: 'artifact-schema'; path: string; schema: any }
  | { type: 'shell'; command: string }
  | { type: 'spec-conformance'; spec: string; scenario: string; section: string }
  | { type: 'expanded'; minNodes?: number }
  | { type: 'intent'; statement: string; expandOnFail?: boolean };

export interface Orientation {
  position: string[];
  level: number;
  batchRemaining: string[];
  batchComplete: boolean;
  preGate: string[];
  produces: string[];
  consumes: string[];
}

export class RoadmapError extends Error {
  constructor(public code: string, public context: any) {
    super(`${code}: ${context.fix || context.message}`);
  }
}
