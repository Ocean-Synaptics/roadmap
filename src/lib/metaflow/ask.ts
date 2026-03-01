// @module metaflow/ask
// @exports buildQuestionBlock, recordAnswer, getAnswers

import { readMeta, writeMeta } from './fs.ts';
import type { RunId, QuestionBlock, AnswerRecord } from './types.ts';

export function buildQuestionBlock(opts: {
  id: string; text: string; type: 'choice' | 'text'; choices?: string[];
}): QuestionBlock {
  return { id: opts.id, text: opts.text, type: opts.type, choices: opts.choices };
}

export function recordAnswer(runId: RunId, questionId: string, value: string, base = process.cwd()): AnswerRecord {
  const meta = readMeta(runId, base);
  const question = meta.questions?.find(q => q.id === questionId);
  if (!question) throw new Error(`Question '${questionId}' not found in run ${runId}`);
  const answer: AnswerRecord = { questionId, value, recordedAt: new Date().toISOString() };
  meta.answers = [...(meta.answers ?? []), answer];
  writeMeta(runId, meta, base);
  return answer;
}

export function getAnswers(runId: RunId, base = process.cwd()): AnswerRecord[] {
  const meta = readMeta(runId, base);
  return meta.answers ?? [];
}
