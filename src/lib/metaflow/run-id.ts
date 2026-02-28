// @module metaflow
// @exports generateRunId
// @entry roadmap/metaflow

import type { RunId } from './types.ts';

export function generateRunId(headSha: string): RunId {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';
  const sha6 = headSha.slice(0, 6);
  return `mf_${date}_${time}_${sha6}` as RunId;
}
