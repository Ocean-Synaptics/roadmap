// @module spec-kit
// @exports AgentBriefOptions, AgentBrief
// @entry roadmap/spec-kit

import type { Orientation } from '../protocol.ts';

/** Options for generating an agent brief for spec-kit workflow. */
export interface AgentBriefOptions {
  /** DAG identifier (e.g., 'fr-sk-integrate-001') */
  dagId: string;
  /** Human-readable intent statement for the agent */
  intent: string;
  /** Current roadmap orientation (batch position) */
  orientation: Orientation;
  /** Absolute path to spec-kit workspace directory (e.g., '.roadmap/spec/') */
  specKitWorkspace: string;
  /** Node-specific produces list (overrides orientation.produces if provided) */
  nodeProduces?: readonly string[];
  /** Node-specific consumes list (overrides orientation.consumes if provided) */
  nodeConsumes?: readonly string[];
}

/** Structured agent brief output. */
export interface AgentBrief {
  /** YAML frontmatter block (without fences) */
  frontmatter: Record<string, unknown>;
  /** Full markdown brief with YAML frontmatter */
  markdown: string;
}
