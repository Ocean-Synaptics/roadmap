export function detectCorruption(completedJson: any, headJson: any): string[] {
  const issues: string[] = [];
  const completedNodeIds = new Set(completedJson.map((c: any) => c.nodeId));
  const headNodeIds = new Set(Object.keys(headJson.nodes || {}));
  
  for (const nodeId of completedNodeIds) {
    if (!headNodeIds.has(nodeId)) {
      issues.push(`Completed node not in DAG: ${nodeId}`);
    }
  }
  return issues;
}
