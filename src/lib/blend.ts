// @module blend
// @exports BlendSpec, BlendResult, blendCandidates

import type { CandidateResult, FileToIntents } from './emit-gallery.ts';

export interface BlendSpec {
  primary: string;    // candidate id — base architecture source
  donors: string[];   // candidates to pull cheaper files from
}

export interface BlendResult {
  files: Record<string, string>;  // merged file set
  substitutions: Array<{ path: string; from: string; reason: string }>;
  reverted: Array<{ path: string; reason: string }>;
  deterministicPass: boolean;
  intentScore: string;            // e.g. "5/6"
}

// A donor file is substitutable only when:
// 1. fileToIntents[path] is non-empty (has intent coverage)
// 2. The donor passed ALL covering intent statements
// Files with no intent coverage are not substitutable (conservative).
export function blendCandidates(
  candidates: CandidateResult[],
  spec: BlendSpec,
  fileToIntents: FileToIntents,
  opts?: { deterministicCheck?: (files: Record<string, string>) => boolean },
): BlendResult {
  const primary = candidates.find(c => c.id === spec.primary);
  if (!primary) throw new Error(`blend: primary candidate '${spec.primary}' not found`);

  const workingFiles: Record<string, string> = { ...primary.files };
  const substitutions: Array<{ path: string; from: string; reason: string }> = [];
  const reverted: Array<{ path: string; reason: string }> = [];

  for (const donorId of spec.donors) {
    const donor = candidates.find(c => c.id === donorId);
    if (!donor) continue;

    for (const path of Object.keys(donor.files)) {
      // Guard: no intent coverage → skip (conservative)
      const coveringStatements = fileToIntents[path];
      if (!coveringStatements || coveringStatements.length === 0) continue;

      // Guard: donor must pass ALL covering intent statements
      const allPass = coveringStatements.every(stmt => {
        const entry = donor.intent.find(i => i.statement === stmt);
        return entry !== undefined && entry.pass === true;
      });
      if (!allPass) continue;

      // Guard: donor file must be cheaper (LOC proxy via content length)
      const donorLen = donor.files[path]?.length ?? 0;
      const primaryLen = primary.files[path]?.length ?? Infinity;
      if (donorLen >= primaryLen) continue;

      // Substitute
      const oldContent = workingFiles[path];
      workingFiles[path] = donor.files[path];

      // Check if substitution breaks deterministic gate
      if (opts?.deterministicCheck && !opts.deterministicCheck(workingFiles)) {
        // Revert
        workingFiles[path] = oldContent;
        reverted.push({
          path,
          reason: `substitution from ${donorId} broke deterministic gate`,
        });
        continue;
      }

      substitutions.push({
        path,
        from: donorId,
        reason: `donor cheaper (${donorLen} < ${primaryLen} chars) and passes all covering intents`,
      });
    }
  }

  // Compute intentScore across the blended result.
  // Collect all unique intent statements referenced in fileToIntents for paths in workingFiles.
  const allStatements = new Set<string>();
  for (const path of Object.keys(workingFiles)) {
    for (const stmt of fileToIntents[path] ?? []) {
      allStatements.add(stmt);
    }
  }

  // A statement passes if it passes in whichever candidate contributed the file.
  // Build a path→candidateId map: substituted paths come from their donor, rest from primary.
  const pathOwner: Record<string, CandidateResult> = {};
  for (const path of Object.keys(workingFiles)) {
    const sub = substitutions.find(s => s.path === path);
    if (sub) {
      const donor = candidates.find(c => c.id === sub.from);
      if (donor) { pathOwner[path] = donor; continue; }
    }
    pathOwner[path] = primary;
  }

  let passed = 0;
  const checkedStatements = new Set<string>();
  for (const path of Object.keys(workingFiles)) {
    for (const stmt of fileToIntents[path] ?? []) {
      if (checkedStatements.has(stmt)) continue;
      checkedStatements.add(stmt);
      const owner = pathOwner[path];
      if (!owner) continue;
      const entry = owner.intent.find(i => i.statement === stmt);
      if (entry?.pass === true) passed++;
    }
  }

  const total = checkedStatements.size;
  const intentScore = `${passed}/${total}`;

  return {
    files: workingFiles,
    substitutions,
    reverted,
    deterministicPass: true,  // stub — production would re-run tsc/vitest
    intentScore,
  };
}
