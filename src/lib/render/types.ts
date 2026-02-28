// @module render/types
// @exports RenderOpts, RenderSection, DagNode, DagLayer, RenderNode, RenderModel, RenderOutput
// @types RenderOpts, RenderSection, DagNode, DagLayer, RenderNode, RenderModel, RenderOutput
// @entry roadmap

export interface RenderOpts {
  tty: boolean;
  width: number;
  color: boolean;
  emoji: boolean;
}

export interface RenderSection { id: string; title: string; body: string }

export type DagNode = { id: string; status: 'done' | 'current' | 'blocked' | 'pending' | 'retired' | 'fail'; desc?: string }
export type DagLayer = { level: number; nodes: DagNode[] }

// Component AST
export type RenderNode =
  | { t: 'text'; s: string }
  | { t: 'line' }
  | { t: 'h1'; s: string }
  | { t: 'h2'; s: string }
  | { t: 'panel'; title: string; body: RenderNode[] }
  | { t: 'table'; headers: string[]; rows: string[][] }
  | { t: 'bar'; label: string; cur: number; total: number; width?: number }
  | { t: 'dagLayers'; layers: DagLayer[] }
  | { t: 'kv'; key: string; value: string }
  | { t: 'list'; items: string[] }

// RenderModel variants
export type RenderModel =
  | { kind: 'orient'; title: string; nodes: RenderNode[] }
  | { kind: 'chart'; title: string; nodes: RenderNode[] }
  | { kind: 'error'; title: string; nodes: RenderNode[] }
  | { kind: 'generic'; title: string; nodes: RenderNode[] }

export interface RenderOutput { ansi?: string; plain: string }
