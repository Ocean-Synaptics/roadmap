// @module metaflow/authority-schema
// @exports AuthorityJson, isAuthorityJson, AUTHORITY_PATH, GOVERNANCE_DIR
// @entry roadmap/metaflow

// Schema for .governance/authority.json — the sovereignty marker.
// Absence of this file → UNGOVERNED state. Only metaflow init is allowed.

export const GOVERNANCE_DIR = ".governance";
export const AUTHORITY_PATH = ".governance/authority.json";

export interface AuthorityJson {
  kernel: "roadmap" | "donjon";
  stage: 0 | 1 | 2 | 3;
  treeSha: string; // git tree SHA at last write (git rev-parse HEAD^{tree})
  since: string; // ISO 8601 timestamp
  receipt: string; // path under .roadmap/receipts/ authorizing last change
}

// --- Type guard ---

export function isAuthorityJson(x: unknown): x is AuthorityJson {
  if (typeof x !== "object" || x === null) return false;
  const a = x as Record<string, unknown>;
  if (a["kernel"] !== "roadmap" && a["kernel"] !== "donjon") return false;
  if (
    a["stage"] !== 0 &&
    a["stage"] !== 1 &&
    a["stage"] !== 2 &&
    a["stage"] !== 3
  )
    return false;
  if (typeof a["treeSha"] !== "string") return false;
  if (typeof a["since"] !== "string") return false;
  if (typeof a["receipt"] !== "string") return false;
  return true;
}
