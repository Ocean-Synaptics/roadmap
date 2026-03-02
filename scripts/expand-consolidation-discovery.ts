#!/usr/bin/env npx tsx

/**
 * Expansion script for consolidation-discovery plan node.
 * Reads spec.md and generates granular implementation nodes.
 * Each node corresponds to a spec scenario or technical detail.
 */

import * as fs from "fs";
import * as path from "path";

interface ExpandedNode {
  id: string;
  desc: string;
  produces: string[];
  consumes: string[];
  deps: string[];
  validate: Array<{ type: string; [key: string]: any }>;
  idempotent: boolean;
}

// Read spec
const specPath = path.join(
  process.cwd(),
  ".specify/specs/roadmap-dag-consolidation-001/spec.md"
);
const spec = fs.readFileSync(specPath, "utf-8");

// Generate nodes from spec scenarios
const nodes: ExpandedNode[] = [
  {
    id: "design-merge-strategy",
    desc: "Design multi-way merge algorithm: handle N DAGs, link at boundaries, validate connectivity",
    produces: ["docs/MERGE-STRATEGY.md"],
    consumes: [".specify/specs/roadmap-dag-consolidation-001/spec.md"],
    deps: [],
    validate: [
      {
        type: "artifact-exists",
        path: "docs/MERGE-STRATEGY.md",
      },
    ],
    idempotent: true,
  },
  {
    id: "design-index-format",
    desc: "Design head-index.json schema: metadata-only format for fast queries, cache strategy",
    produces: ["docs/INDEX-SCHEMA.md"],
    consumes: [".specify/specs/roadmap-dag-consolidation-001/spec.md"],
    deps: [],
    validate: [
      {
        type: "artifact-exists",
        path: "docs/INDEX-SCHEMA.md",
      },
    ],
    idempotent: true,
  },
  {
    id: "design-lazy-loading",
    desc: "Design lazy loading strategy: when to load full specs vs index-only, cache invalidation rules",
    produces: ["docs/LAZY-LOADING-DESIGN.md"],
    consumes: [".specify/specs/roadmap-dag-consolidation-001/spec.md"],
    deps: [],
    validate: [
      {
        type: "artifact-exists",
        path: "docs/LAZY-LOADING-DESIGN.md",
      },
    ],
    idempotent: true,
  },
  {
    id: "consolidation-design-review",
    desc: "Review all design docs together, identify conflicts, finalize architecture before implementation",
    produces: ["docs/CONSOLIDATION-DESIGN.md"],
    consumes: [
      "docs/MERGE-STRATEGY.md",
      "docs/INDEX-SCHEMA.md",
      "docs/LAZY-LOADING-DESIGN.md",
    ],
    deps: [
      "design-merge-strategy",
      "design-index-format",
      "design-lazy-loading",
    ],
    validate: [
      {
        type: "artifact-exists",
        path: "docs/CONSOLIDATION-DESIGN.md",
      },
    ],
    idempotent: true,
  },
];

// Output as JSON for roadmap to import
console.log(JSON.stringify({ nodes }, null, 2));
