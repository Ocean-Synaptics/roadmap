// @module enforcement
// @exports StateMachine, StateTransitionLog, validateTransition
// @types NodeState, StateTransition, TransitionRule
// @entry roadmap

export type NodeState =
  | 'init'
  | 'pending'
  | 'claimed'
  | 'executing'
  | 'validated'
  | 'complete'
  | 'failed'
  | 'skipped';

export interface StateTransition {
  nodeId: string;
  from: NodeState;
  to: NodeState;
  timestamp: string;
  owner?: string;
  evidence: Record<string, unknown>;
  reason?: string;
}

export interface TransitionRule {
  from: NodeState;
  to: NodeState[];
}

/**
 * State machine enforcement: validates legal state transitions
 */
export class StateMachine {
  private transitionRules: Map<NodeState, NodeState[]> = new Map([
    ['init', ['pending']],
    ['pending', ['claimed']],
    ['claimed', ['executing']],
    ['executing', ['validated', 'failed']],
    ['validated', ['complete']],
    ['complete', []],
    ['failed', ['pending']],
    ['skipped', []],
  ]);

  isLegalTransition(from: NodeState, to: NodeState): boolean {
    const allowed = this.transitionRules.get(from) || [];
    return allowed.includes(to);
  }

  validateTransition(nodeId: string, from: NodeState, to: NodeState): { valid: boolean; reason?: string } {
    if (!this.isLegalTransition(from, to)) {
      return {
        valid: false,
        reason: `illegal transition: ${nodeId} cannot go from ${from} to ${to}`,
      };
    }
    return { valid: true };
  }

  getNextStates(currentState: NodeState): NodeState[] {
    return this.transitionRules.get(currentState) || [];
  }

  addRule(from: NodeState, to: NodeState[]): void {
    this.transitionRules.set(from, to);
  }
}

/**
 * State transition log: audit trail of all state changes
 */
export class StateTransitionLog {
  private log: StateTransition[] = [];

  record(transition: StateTransition): void {
    this.log.push(transition);
  }

  getLog(): StateTransition[] {
    return [...this.log];
  }

  getTransitions(nodeId: string): StateTransition[] {
    return this.log.filter(t => t.nodeId === nodeId);
  }

  getLastTransition(nodeId: string): StateTransition | undefined {
    const transitions = this.getTransitions(nodeId);
    return transitions[transitions.length - 1];
  }

  getCurrentState(nodeId: string): NodeState | undefined {
    const last = this.getLastTransition(nodeId);
    return last?.to;
  }

  verify(nodeId: string, expectedState: NodeState): boolean {
    return this.getCurrentState(nodeId) === expectedState;
  }

  findDeadlock(): StateTransition[] {
    const timeWindow = 60000; // 1 minute
    const now = Date.now();
    const recentStuck = this.log.filter(t => {
      const age = now - new Date(t.timestamp).getTime();
      return age < timeWindow && (t.to === 'executing' || t.to === 'claimed');
    });
    return recentStuck;
  }
}

/**
 * Audit verification: validates state history against recorded transitions
 */
export class AuditVerifier {
  verify(log: StateTransition[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const sm = new StateMachine();

    // Group by nodeId
    const nodeTransitions = new Map<string, StateTransition[]>();
    for (const t of log) {
      if (!nodeTransitions.has(t.nodeId)) {
        nodeTransitions.set(t.nodeId, []);
      }
      nodeTransitions.get(t.nodeId)!.push(t);
    }

    // Verify each node's transition sequence
    nodeTransitions.forEach((transitions, nodeId) => {
      let currentState: NodeState = 'init';
      for (const t of transitions) {
        if (t.from !== currentState) {
          errors.push(`${nodeId}: expected from=${currentState}, got from=${t.from}`);
        }
        if (!sm.isLegalTransition(t.from, t.to)) {
          errors.push(`${nodeId}: illegal transition ${t.from} → ${t.to}`);
        }
        currentState = t.to;
      }
    });

    return { valid: errors.length === 0, errors };
  }
}
