// @module verify (barrel — re-exports from verify/)
// @exports Violation, VerifyResult, runVerify, bfsReachability, ReachabilityResult, contractClosure, ContractViolation
// @entry roadmap

export { bfsReachability, contractClosure } from './verify/graph-algorithms.ts';
export type { ReachabilityResult, ContractViolation } from './verify/graph-algorithms.ts';
export { runVerify } from './verify/orchestrator.ts';
export type { Violation, VerifyResult } from './verify/orchestrator.ts';
