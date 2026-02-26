/**
 * roadmap/agent — sealed APIs for regent-style executors
 *
 * Agents import from here. They cannot reach the DAG directly — getBrief/checkpoint/
 * advance are the only operations agents need. This boundary is intentional.
 */

export { getBrief, loadHandoffJournal } from './lib/brief.ts';
export { checkpoint, advance, verifyBootstrapSignature } from './lib/handoff.ts';

export type { Brief, FinalHandoff, InterimHandoff } from './lib/brief.ts';
